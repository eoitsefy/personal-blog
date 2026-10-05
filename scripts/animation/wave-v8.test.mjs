import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { out, root, S, keyFiles, readPixels, hash, assertKeyApproval, assertResources } from './wave-v8.mjs';
import { green, fitForeground, recoverMatte } from './green-matte.mjs';
const json = async name => JSON.parse(await readFile(resolve(out,name),'utf8'));
test('v8 interpolation permission is bound to every actual pose, never an old approval', async () => {
  const automatic=await json('review/automatic.json'), visual=await json('review/key-visual.json');
  const hashes=[];
  for(const file of keyFiles)hashes.push(hash((await readPixels(resolve(out,'keys',file))).data));
  assert.equal(assertKeyApproval(automatic,visual,hashes),automatic.artScopeSha256);
  assert.throws(()=>assertKeyApproval(automatic,{...visual,releaseAllowed:true},hashes),/key_art_not_approved/);
  assert.throws(()=>assertKeyApproval(automatic,{...visual,status:'REJECTED'},hashes),/key_art_not_approved/);
  assert.throws(()=>assertKeyApproval(automatic,{...visual,artScopeSha256:'old approval'},hashes),/key_hash_mismatch/);
  assert.throws(()=>assertKeyApproval(automatic,visual,[...hashes.slice(0,-1),'changed']),/key_hash_mismatch/);
});
test('v8 head, central body, soles and borders are byte-identical to the original', async () => {
  const original=(await readPixels(resolve(out,'reference/neutral-clean.png'))).data;
  const baseline=(await readPixels(resolve(root,'docs/assistant/art-pilot-v6/reference/neutral-clean.png'))).data;
  assert.deepEqual(original,baseline);
  for(const file of keyFiles) {
    const {data,info}=await readPixels(resolve(out,'keys',file));
    assert.equal(info.width,S);assert.equal(info.height,S);assert.equal(info.channels,4);
    for(let y=0;y<S;y++)for(let x=0;x<S;x++) {
      const p=(y*S+x)*4;
      const head=y<400&&original[p+3]>=8, torso=x>=346&&y>=400&&y<527;
      if(head||torso||y>=527)assert.equal(data.subarray(p,p+4).compare(original.subarray(p,p+4)),0,`${file} ${x},${y}`);
      if(x===0||y===0||x===S-1||y===S-1)assert.equal(data[p+3],0);
    }
  }
});
test('v8 poses and image prompts retain source hashes, discarded outputs and exact references', async () => {
  const automatic=await json('review/automatic.json'), prompts=await json('prompts.json');
  assert.equal(automatic.newGeneratedPoses,3);assert.equal(automatic.reusedMiddle,true);
  for(const pose of automatic.poses) {
    assert.equal(hash(await readFile(resolve(out,'generated',pose.name+'.png'))),pose.sourceSha256);
    assert.equal(hash((await readPixels(resolve(out,'keys',pose.file))).data),pose.rgbaSha256);
    assert.equal(pose.passed,true);assert.equal(pose.headSkinOverlap,0);
  }
  assert.equal(prompts.requests.length,5);assert.equal(prompts.requests.filter(p=>p.selected).length,3);
  for(const request of prompts.requests) {
    assert.ok(request.prompt.length>1000);assert.equal(request.transparentBackground,true);
    await readFile(resolve(out,request.resultFile));
    for(const reference of request.referencedImagePaths)await readFile(resolve(root,reference));
  }
});
test('v8 resource guard rejects low disk, low RAM or concurrent Comfy before inference', () => {
  const GiB=1024**3;
  assert.doesNotThrow(()=>assertResources(8*GiB,4*GiB,false));
  assert.throws(()=>assertResources(8*GiB-1,4*GiB,false),/system_disk_below/);
  assert.throws(()=>assertResources(8*GiB,4*GiB-1,false),/physical_memory_below/);
  assert.throws(()=>assertResources(9*GiB,5*GiB,true),/comfy_must_remain_stopped/);
});
test('single matte reconstruction shares one color prediction and preserves known fractional alpha', () => {
  const foreground=[236,180,152];
  for(const alpha of [0,.25,.5,.75,1]) {
    const observed=foreground.map((c,i)=>c*alpha+green[i]*(1-alpha));
    const fit=fitForeground(observed,[foreground,[20,20,20]]);
    assert.ok(Math.abs(fit.alpha-alpha)<1e-10);
    const rgba=recoverMatte(observed,fit.foreground);
    if(!alpha)assert.deepEqual(rgba,[0,0,0,0]);
    else {assert.deepEqual(rgba.slice(0,3),foreground);assert.equal(rgba[3],Math.round(alpha*255));}
  }
  assert.throws(()=>fitForeground([0,255,0],[]),/empty_foreground_palette/);
});
test('v8 complete sequences remain offline when any technical or visual frame fails', async () => {
  const visual=await json('review/visual.json');
  const original=(await readPixels(resolve(out,'reference/neutral-clean.png'))).data;
  assert.equal(visual.status,'REJECTED');assert.equal(visual.releaseAllowed,false);
  for(const [reportName,directory] of [['interpolation.json','frames'],['matte-interpolation.json','matte-frames']]) {
    const report=await json('review/'+reportName);
    assert.equal(report.status,'REJECTED_TECHNICAL');assert.equal(report.releaseAllowed,false);assert.equal(report.productionChanged,false);
    assert.equal(report.outputFrameCount,33);assert.equal(report.newIndependentPoseDrawingsThisTurn,3);assert.equal(report.fps,15);
    assert.equal(report.delayMs.reduce((a,b)=>a+b,0),3000);
    const hashes=[];
    for(const frame of report.frames) {
      const actual=(await readPixels(resolve(out,directory,String(frame.index).padStart(3,'0')+'.png'))).data;
      hashes.push(hash(actual));assert.equal(hash(actual),frame.rgbaSha256);assert.equal(frame.staticChanges,0);
      // Independent raw-byte region checks, not the authoring mask predicate.
      assert.equal(actual.subarray(0,345*S*4).compare(original.subarray(0,345*S*4)),0);
      assert.equal(actual.subarray(527*S*4).compare(original.subarray(527*S*4)),0);
      for(let y=400;y<527;y++) {
        const p=(y*S+346)*4,end=(y+1)*S*4;
        assert.equal(actual.subarray(p,end).compare(original.subarray(p,end)),0);
      }
      for(let y=345;y<400;y++)for(let x=0;x<S;x++) {
        const p=(y*S+x)*4;
        if(original[p+3]>=8)for(let c=0;c<4;c++)assert.equal(actual[p+c],original[p+c]);
      }
    }
    assert.equal(hash(Buffer.from(hashes.join(''))),report.frameScopeSha256);
    assert.ok(report.frames.some(frame=>!frame.passed));
    assert.ok(visual.attempts.some(attempt=>attempt.frameScopeSha256===report.frameScopeSha256));
    assert.equal(report.deepSeekCalls,0);assert.equal(report.cloudImageCalls,0);
  }
});
