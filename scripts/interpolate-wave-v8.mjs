// Offline full-frame pilot only. No public assets, cloud API or ComfyUI job.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freemem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { out, S, neutralPath, keyFiles, readPixels, hash, assertKeyApproval, assertResources, interpolationEditable } from './animation/wave-v8.mjs';
import { foregroundPalette, fitForeground, recoverMatte, green } from './animation/green-matte.mjs';
const run = promisify(execFile);
const automatic = JSON.parse(await readFile(resolve(out, 'review/automatic.json'), 'utf8'));
const visual = JSON.parse(await readFile(resolve(out, 'review/key-visual.json'), 'utf8'));
const keys = [];
for (const file of keyFiles) keys.push((await readPixels(resolve(out, 'keys', file))).data);
const scope = assertKeyApproval(automatic, visual, keys.map(hash));
const neutral = (await readPixels(neutralPath)).data;
const matteMode = process.argv.includes('--single-matte');
const frameDirectory = matteMode ? 'matte-frames' : 'frames';
const reviewPrefix = matteMode ? 'matte-' : '';
const channels = matteMode ? ['matte'] : ['color', 'alpha'];
const palette = matteMode ? foregroundPalette(keys, (x,y)=>interpolationEditable(x,y,neutral), S) : null;
const fitCache = new Map();
const sequence = [0,1,2,3,4,3,2,1,0];
const steps = 4, count = (sequence.length - 1) * steps + 1, fps = 15;
const job = resolve('D:/CodexTools/assistant-animation/jobs', 'wave-v8-' + Date.now());
const exe = 'D:/CodexTools/assistant-animation/tools/rife-v4.6/rife-ncnn-vulkan.exe';
const model = 'D:/CodexTools/assistant-animation/tools/rife-v4.6/rife-v4.6';
const trace = [], resources = [];
await mkdir(job, { recursive: true });
await mkdir(resolve(out, frameDirectory), { recursive: true });
async function resourceGate() {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command',
    "[pscustomobject]@{freeDiskBytes=(Get-PSDrive C).Free;comfyRunning=[bool](Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)} | ConvertTo-Json -Compress"], { timeout: 15000 });
  const state = { ...JSON.parse(stdout), freeMemoryBytes: freemem(), at: new Date().toISOString() };
  assertResources(state.freeDiskBytes, state.freeMemoryBytes, state.comfyRunning);
  resources.push(state);
  console.log(`Resource gate passed: C=${(state.freeDiskBytes/1024**3).toFixed(2)}GiB RAM=${(state.freeMemoryBytes/1024**3).toFixed(2)}GiB`);
}
await resourceGate();
for (const channel of channels) await mkdir(resolve(job, channel + '-in'), { recursive: true });
for (const [i, keyIndex] of sequence.entries()) {
  const pixels = keys[keyIndex], color = Buffer.alloc(S*S*3), alpha = Buffer.alloc(S*S*3), matte = matteMode ? Buffer.alloc(S*S*3) : null;
  for (let p = 0; p < S*S; p++) {
    const a = pixels[p*4+3]/255;
    for (let c = 0; c < 3; c++) {
      color[p*3+c] = Math.round(pixels[p*4+c]*a + 128*(1-a));
      alpha[p*3+c] = pixels[p*4+3];
      if(matte)matte[p*3+c]=Math.round(pixels[p*4+c]*a+green[c]*(1-a));
    }
  }
  for (const [channel, data] of (matteMode ? [['matte',matte]] : [['color', color], ['alpha', alpha]]))
    await sharp(data, { raw: { width:S, height:S, channels:3 } }).png().toFile(resolve(job, channel+'-in', String(i).padStart(8,'0')+'.png'));
}
for (const channel of channels) {
  await resourceGate();
  const input = resolve(job, channel+'-in'), output = resolve(job, channel+'-out');
  await mkdir(output, { recursive:true });
  // Directory sampling uses keyCount/outputCount. Keep 33 out of 36 results.
  const args = ['-i',input,'-o',output,'-n',String(sequence.length*steps),'-m',model,'-g','1','-j','1:1:1','-f','%08d.png'];
  console.log(`Local RIFE ${channel} pass started`);
  const start = Date.now();
  const env = { ...process.env, TEMP:job, TMP:job };
  for (const name of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD/i.test(name)) delete env[name];
  const result = await run(exe, args, { cwd:dirname(exe), env, timeout:180000, maxBuffer:1000000 });
  trace.push({ channel, elapsedMs:Date.now()-start, args, diagnostics:result.stderr.split('\n').filter(line => /NVIDIA|GeForce|Intel|failed|error|device|queue|VK_/i.test(line)) });
  console.log(`Local RIFE ${channel} pass completed`);
}
const frames = [], measures = [];
for (let i = 0; i < count; i++) {
  let data;
  if (i % steps === 0) data = Buffer.from(keys[sequence[i/steps]]);
  else {
    const name = String(i+1).padStart(8,'0')+'.png';
    const color = await sharp(resolve(job,matteMode?'matte-out':'color-out',name)).removeAlpha().raw().toBuffer();
    const alpha = matteMode ? null : await sharp(resolve(job,'alpha-out',name)).removeAlpha().raw().toBuffer();
    data = Buffer.from(neutral);
    for (let y=0; y<S; y++) for (let x=0; x<S; x++) {
      if (!interpolationEditable(x,y,neutral)) continue;
      const p=y*S+x;
      if(matteMode) {
        const observed=[color[p*3],color[p*3+1],color[p*3+2]];
        const code=observed.map(c=>Math.floor(c/8)).join(',');
        if(!fitCache.has(code))fitCache.set(code,fitForeground(observed,palette).foreground);
        const rgba=recoverMatte(observed,fitCache.get(code));
        for(let c=0;c<4;c++)data[p*4+c]=rgba[c];
        continue;
      }
      const a=Math.round((alpha[p*3]+alpha[p*3+1]+alpha[p*3+2])/3);
      if (a<8) { data.fill(0,p*4,p*4+4); continue; }
      for (let c=0; c<3; c++) data[p*4+c] = Math.max(0,Math.min(255,Math.round((color[p*3+c]-128*(1-a/255))/(a/255))));
      data[p*4+3]=a;
    }
  }
  let staticChanges=0, skinOpaque=0, skinTranslucent=0, safeMargins=true;
  for (let y=0; y<S; y++) for (let x=0; x<S; x++) {
    const p=(y*S+x)*4, a=data[p+3];
    if (!interpolationEditable(x,y,neutral) && data.subarray(p,p+4).compare(neutral.subarray(p,p+4))) staticChanges++;
    if (a>=8 && (x<154 || y<154 || x>613 || y>613)) safeMargins=false;
    if (x>=218 && x<330 && y>=345 && y<527 && a>=20 && data[p]>160 && data[p]>data[p+1]+8 && data[p+1]>data[p+2]+8) {
      if (a>=245) skinOpaque++; else skinTranslucent++;
    }
  }
  const ratio = skinTranslucent / Math.max(1,skinOpaque+skinTranslucent);
  const file = resolve(out,frameDirectory,String(i).padStart(3,'0')+'.png');
  await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(file);
  frames.push(file);
  // Neutral's original antialiased edge is trusted by exact byte equality,
  // not falsely rejected by the moving-skin heuristic.
  const exactNeutral=i===0||i===count-1;
  measures.push({ index:i,rgbaSha256:hash(data),exactKey:i%steps===0,exactNeutral,staticChanges,safeMargins,skinOpaque,skinTranslucent,skinTranslucentRatio:ratio,passed:staticChanges===0&&safeMargins&&(exactNeutral?data.equals(neutral):ratio<.05) });
}
const delay = frames.map(() => Math.round(1000/fps));
delay[delay.length-1] = 3000 - delay.slice(0,-1).reduce((a,b)=>a+b,0);
await sharp(await Promise.all(frames.map(file=>readFile(file))),{join:{animated:true}})
  .webp({lossless:true,effort:6,loop:0,delay}).toFile(resolve(out,`wave-${reviewPrefix}15fps.webp`));
for (const theme of ['light','dark']) {
  const background = theme==='light'?'#f4f1e9':'#181e25';
  for (const detail of [false,true]) {
    const crop=detail?{left:208,top:342,width:145,height:189}:{left:176,top:144,width:416,height:512};
    const w=detail?218:208, h=detail?284:256, cols=9, rows=Math.ceil(count/cols);
    const tiles=[];
    for (const [i,file] of frames.entries()) tiles.push({input:await sharp(file).extract(crop).resize(w,h).png().toBuffer(),left:(i%cols)*w,top:Math.floor(i/cols)*h});
    await sharp({create:{width:w*cols,height:h*rows,channels:4,background}}).composite(tiles).png().toFile(resolve(out,'review',`${reviewPrefix}frames-${detail?'arm':'whole'}-${theme}.png`));
  }
}
const report = { version:1,date:new Date().toISOString(),status:measures.every(m=>m.passed)?'PENDING_ANIMATION_ART_REVIEW':'REJECTED_TECHNICAL',
  releaseAllowed:false,productionChanged:false,sourceKeyScopeSha256:scope,frameScopeSha256:hash(Buffer.from(measures.map(m=>m.rgbaSha256).join(''))),
  method:matteMode?'Local single green-matte RIFE; reference-palette fitting; static original protection; exact keys at all nodes':'Local RIFE RGB and separate alpha; original static pixels restored; exact keys at all nodes',sequence,stepsPerInterval:steps,
  uniqueIndependentPoseDrawings:5,newIndependentPoseDrawingsThisTurn:3,outputFrameCount:count,fps,delayMs:delay,loopDurationMs:3000,
  heldNeutralMs:delay.at(-1),wristSideToSideCycle:false,cloudImageCalls:0,deepSeekCalls:0,temporaryRoot:job,paletteColors:palette?.length??0,trace,resources,frames:measures };
await writeFile(resolve(out,`review/${reviewPrefix}interpolation.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,frames:count,failedFrames:measures.filter(m=>!m.passed).map(m=>m.index),artScope:report.frameScopeSha256,preview:resolve(out,`wave-${reviewPrefix}15fps.webp`)}));
if (report.status==='REJECTED_TECHNICAL') process.exitCode=1;
