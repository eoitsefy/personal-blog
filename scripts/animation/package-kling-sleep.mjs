// Offline, immutable whole-frame atlases; native 24 fps, no limb compositing.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
const folder=resolve(process.argv[2]||''),root='docs/assistant/sleep-bed-v2';
assert.ok(process.argv[2]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=JSON.parse(await readFile(resolve(folder,'sources.json'),'utf8'));
const matte=JSON.parse(await readFile(resolve(folder,'matte-refined-review.json'),'utf8'));
assert.equal(matte.status,'FULL_PENDING_ART_REVIEW');assert.equal(matte.revision,12);assert.equal(matte.holeFilling,false);
assert.equal(matte.recipeSha256,hash(await readFile('scripts/animation/refine-kling-sleep-alpha.py')));
assert.equal(matte.semanticRecipeSha256,hash(await readFile('scripts/animation/matte-kling-sleep-birefnet.py')));
assert.equal(matte.exteriorRecipeSha256,hash(await readFile('scripts/animation/prepare-kling-sleep.py')));
await mkdir(root+'/review',{recursive:true});
const columns=4,tile=480,pageFrames=24,assets={},clips={};
async function immutable(path,bytes){
  try{assert.deepEqual(await readFile(path),Buffer.from(bytes),'Immutable package changed: '+path);}
  catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,bytes,{flag:'wx'});}
}
for(const[action,count]of[['enter',193],['wake',121]]){
  const d=sources[action];assert.equal(d.frameCount,count);assert.equal(d.fps,24);
  assert.equal(matte.frames[action].length,count);
  assert.equal(hash(await readFile(resolve(folder,action+'-original.mp4'))),d.videoSha256);
  const pages=[],frames=[];
  for(let start=0;start<count;start+=pageFrames){
    const n=Math.min(pageFrames,count-start),composites=[],tiles=[];
    for(let k=0;k<n;k++){
      const i=start+k,source=await readFile(resolve(folder,`${action}-cutouts-v12/${String(i).padStart(3,'0')}.png`));
      assert.equal(hash(source),matte.frames[action][i].sha256);
      const bytes=await sharp(source).resize(tile,tile).png().toBuffer();tiles.push(bytes);
      composites.push({input:bytes,left:k%columns*tile,top:Math.floor(k/columns)*tile});
      frames.push({index:i,sourceIndex:i,originalPngSha256:d.frames[i].sha256,preparedPngSha256:hash(source)});
    }
    const width=columns*tile,height=Math.ceil(n/columns)*tile;
    const bytes=await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(composites)
      .webp({quality:92,alphaQuality:100,effort:5})
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="AI-generated with Kling Video 3.0; sleep-bed-v2 whole-frame video; original provenance retained"/></rdf:RDF></x:xmpmeta>').toBuffer();
    const decoded=await sharp(bytes).ensureAlpha().raw().toBuffer();
    for(let k=0;k<n;k++){
      const expected=await sharp(tiles[k]).ensureAlpha().raw().toBuffer(),actual=Buffer.alloc(expected.length);
      for(let y=0;y<tile;y++){const begin=((Math.floor(k/columns)*tile+y)*width+k%columns*tile)*4;decoded.copy(actual,y*tile*4,begin,begin+tile*4);}
      let error=0,pixels=0;
      for(let p=0;p<actual.length;p+=4){assert.equal(actual[p+3],expected[p+3]);if(expected[p+3]>200){for(let c=0;c<3;c++)error+=Math.abs(actual[p+c]-expected[p+c]);pixels+=3;}}
      assert.ok(error/pixels<3.5);frames[start+k].tileRgbaSha256=hash(actual);
    }
    const src=`/assistant/chibi-sleep-${action}-v2-${pages.length}.webp`;
    await immutable('public'+src,bytes);assert.ok(bytes.length<1024*1024);
    pages.push({src,sha256:hash(bytes),bytes:bytes.length,width,height,start,frames:n});
    console.log(action+' page '+(pages.length-1)+' bytes='+bytes.length);
  }
  assets[action]={columns,tileWidth:tile,tileHeight:tile,pageFrames,frames:count,pages};
  clips[action]={sourceVideoSha256:d.videoSha256,fps:24,durationMs:count/24*1000,frames};
}
const loop=[...Array.from({length:49},(_,i)=>192-i),...Array.from({length:47},(_,i)=>145+i)];
const manifest={version:'sleep-bed-v2',status:'PENDING_ART_AND_BROWSER_REVIEW',processing:{wholeFrame:true,limbCompositing:false,geometryEdits:false,interpolation:false,alphaLossless:true,fixedCanvas:[960,960],uniformScale:.5,recipeSha256:matte.recipeSha256,semanticRecipeSha256:matte.semanticRecipeSha256,exteriorRecipeSha256:matte.exteriorRecipeSha256,modelSha256:matte.modelSha256},credits:{additionalGeneration:0,additionalSpend:0},assets,clips,loop:{fps:24,durationMs:4000,source:'enter',indices:loop,method:'native stable sleeping frames, forward/reverse, no generated intermediate poses'}};
manifest.assetScopeSha256=hash(Object.values(assets).flatMap(a=>a.pages.map(p=>p.src+':'+p.sha256)).sort().join('\n'));
manifest.frameScopeSha256=hash(Object.entries(clips).flatMap(([a,c])=>c.frames.map(f=>a+':'+f.tileRgbaSha256)).join('\n'));
await immutable(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const config=`// Generated by package-kling-sleep.mjs; full-frame, fixed-camera artwork.\nexport const SLEEP_ART_VERSION = "sleep-bed-v2";\nexport const SLEEP_SHEETS = ${JSON.stringify(assets,null,2)} as const;\nexport const SLEEP_LOOP = ${JSON.stringify(loop)} as const;\nexport const SLEEP_FPS = 24;\n`;
const configPath='src/lib/assistant/sleep-sheets.ts';
try {const previous=await readFile(configPath,'utf8');assert.ok(previous===config||previous.startsWith('// Generated by package-kling-sleep.mjs; full-frame, fixed-camera artwork.\nexport const SLEEP_ART_VERSION = "sleep-bed-v1";'),'Refuse to replace unrelated generated config');}
catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(configPath,config);
console.log('assetScopeSha256='+manifest.assetScopeSha256);
