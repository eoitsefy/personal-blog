// Package an owner-accepted whole-figure video derivative, never synthesize poses.
// Usage: node scripts/animation/prepare-kling-wave.mjs <external sample directory>
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
const input=resolve(process.argv[2]||''),pack='docs/assistant/kling-wave-v1';
assert.ok(process.argv[2],'External sample directory required');
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(resolve(input,'wave-original.mp4'));
assert.equal(hash(raw),'0f1495e856a10445ef705c57bb4faf974925a1b5868b0184a6aaa3218c6b911e');
const reference=await readFile('public/assistant/chibi-neutral-left-collar-v4.png');
assert.equal(hash(reference),'9d102b3251940dbd3e1a8e2c8437b5fd719b0312bdff674329b2ee6e9337d091');
const neutral=await sharp('public/assistant/chibi-idle-blink-refined-v1.webp').extract({left:0,top:0,width:366,height:460}).png().toBuffer();
const columns=6,tileWidth=244,tileHeight=308,width=columns*tileWidth,height=21*tileHeight;
const tiles=[],frames=[],composites=[];
for(let i=0;i<121;i++){
 const path=resolve(input,`wave-cutouts-v1/${String(i).padStart(3,'0')}.png`),source=await readFile(path);
 // Every sample uses the SAME crop and uniform scale; no per-frame centring.
 const crop=i===0||i===120?neutral:await sharp(source).extract({left:180,top:153,width:366,height:460}).png().toBuffer();
 const tile=await sharp(crop).resize({width:244}).extend({top:0,bottom:1,left:0,right:0,background:'#00000000'}).png().toBuffer();
 const {data,info}=await sharp(tile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,tileWidth);assert.equal(info.height,tileHeight);
 for(let x=0;x<tileWidth;x++)for(const y of [0,tileHeight-1])assert.equal(data[(y*tileWidth+x)*4+3],0,'Alpha reaches row gutter');
 for(let y=0;y<tileHeight;y++)for(const x of [0,tileWidth-1])assert.equal(data[(y*tileWidth+x)*4+3],0,'Alpha reaches column gutter');
 tiles.push(tile);frames.push({index:i,sourcePngSha256:hash(source),tileRgbaSha256:hash(data)});
 composites.push({input:tile,left:i%columns*tileWidth,top:Math.floor(i/columns)*tileHeight});
}
const xmp=Buffer.from(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="AI-generated with Kling Video 3.0; source ProduceID HB1_PROD_ai_web_323375346120805; derivative: transparent whole-frame wave"/></rdf:RDF></x:xmpmeta>`);
const atlas=await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(composites).webp({quality:92,alphaQuality:100,effort:6}).withXmp(xmp.toString()).toBuffer();
const decoded=await sharp(atlas).ensureAlpha().raw().toBuffer();
let maxOpaqueRgbMeanError=0;
for(let i=0;i<tiles.length;i++){
 const expected=await sharp(tiles[i]).ensureAlpha().raw().toBuffer(),actual=Buffer.alloc(expected.length);
 let error=0,count=0;
 for(let y=0;y<tileHeight;y++){
  const start=((Math.floor(i/columns)*tileHeight+y)*width+i%columns*tileWidth)*4;
  decoded.copy(actual,y*tileWidth*4,start,start+tileWidth*4);
 }
 for(let p=0;p<expected.length;p+=4){assert.equal(actual[p+3],expected[p+3],'Alpha changed during compression');if(expected[p+3]>200){for(let c=0;c<3;c++)error+=Math.abs(actual[p+c]-expected[p+c]);count+=3;}}
 const mean=error/count;assert.ok(mean<=3,'Color compression damaged the sample');maxOpaqueRgbMeanError=Math.max(mean,maxOpaqueRgbMeanError);
 frames[i].tileRgbaSha256=hash(actual);
}
await mkdir(pack+'/review',{recursive:true});
const src='/assistant/chibi-wave-kling-v1.webp';
await writeFile('public'+src,atlas,{flag:'wx'});
// Compact thumbnails are for reviewing all transitions, not production frames.
for(const [theme,bg]of[['light','#f7f4eb'],['dark','#171b21']]){
 const cells=[];
 for(let i=0;i<tiles.length;i++)cells.push({input:await sharp(tiles[i]).resize({width:122}).flatten({background:bg}).png().toBuffer(),left:i%11*122,top:Math.floor(i/11)*154});
 await writeFile(pack+`/review/all-frames-${theme}.png`,await sharp({create:{width:1342,height:1694,channels:4,background:bg}}).composite(cells).png().toBuffer());
}
const old=JSON.parse(await readFile('docs/assistant/blink-refinement-v1/candidate.json','utf8'));
const keptAssets={idle:old.asset,...old.keptAssets};delete keptAssets['pilot-wave'];
const asset={src,width,height,bytes:atlas.length,sha256:hash(atlas),columns,tileWidth,tileHeight,frames:121};
const m={version:1,status:'OWNER_ACCEPTED_WAVE_PENDING_TECHNICAL_RELEASE',ownerAcceptance:{scope:['wave'],sourceVideoSha256:hash(raw),extraBlinkAccepted:true,otherActionsAuthorized:false},source:{videoSha256:hash(raw),referenceSha256:hash(reference),provider:'Kling Video 3.0',produceId:'HB1_PROD_ai_web_323375346120805',originalAigcMetadataRetained:true,originalFile:'external/wave-original.mp4'},processing:{wholeFrame:true,limbCompositing:false,interpolation:false,fps:24,sourceFrameCount:121,durationMs:121/24*1000,sourceCrop:{left:180,top:153,width:366,height:460},uniformScale:2/3,alphaMethod:'border-connected black background with enclosed dark ink preservation',platformMarksOutsideCharacterRoi:true,aiOriginInDerivativeXmp:true,neutralEndpointSource:'existing canonical idle frame',webpQuality:92,alphaLossless:true,maxOpaqueRgbMeanError},asset,keptAssets,frames};
m.processing.fixedRuntimeAnchor={x:136,y:305};
m.frameScopeSha256=hash(frames.map(f=>f.tileRgbaSha256).join(''));
m.assetScopeSha256=hash([asset,...Object.values(keptAssets)].map(a=>a.src+':'+a.sha256).sort().join('\n'));
await writeFile(pack+'/manifest.json',JSON.stringify(m,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({asset,assetScopeSha256:m.assetScopeSha256,frameScopeSha256:m.frameScopeSha256}));
