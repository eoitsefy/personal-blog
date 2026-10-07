// Package existing approved whole-frame clips; no API, interpolation or geometry edits.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
const input=resolve(process.argv[2]||''),pack='docs/assistant/kling-gestures-v2';
assert.ok(process.argv[2],'External sample directory required');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function immutableWrite(path,bytes){
 try{assert.deepEqual(await readFile(path),Buffer.from(bytes),'Existing package differs: '+path);}
 catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,bytes,{flag:'wx'});}
}
const old=JSON.parse(await readFile('docs/assistant/kling-wave-v1/manifest.json','utf8'));
const palette=JSON.parse(await readFile(resolve(input,'wave-cutouts-palm-v2/report.json'),'utf8'));
assert.equal(palette.geometryChanges,0);assert.equal(palette.alphaChanges,0);assert.equal(palette.outsideMaskChanges,0);
const neutral=await sharp('public/assistant/chibi-idle-blink-refined-v1.webp').extract({left:0,top:0,width:366,height:460}).png().toBuffer();
const definitions={wave:{source:'wave',folder:'wave-cutouts-palm-v2',first:0,last:120,produceId:'HB1_PROD_ai_web_323375346120805',sourceHash:'0f1495e856a10445ef705c57bb4faf974925a1b5868b0184a6aaa3218c6b911e',file:'chibi-wave-kling-v2.webp'},
 bow:{source:'nod',folder:'nod-cutouts-v1',first:24,last:96,produceId:'HB1_PROD_ai_web_323375131217210',sourceHash:'c334cc0ee91d374304b7d87a16c892b1fbd9180008d9aa95855ddf80cdc16384',file:'chibi-bow-kling-v1.webp'}};
const columns=6,tileWidth=244,tileHeight=308,assets={},clips={},scopeFrames=[];
await mkdir(pack+'/review',{recursive:true});
for(const [action,d] of Object.entries(definitions)){
 assert.equal(hash(await readFile(resolve(input,d.source+'-original.mp4'))),d.sourceHash);
 const count=d.last-d.first+1,width=columns*tileWidth,height=Math.ceil(count/columns)*tileHeight,tiles=[],frames=[],composites=[];
 for(let i=0;i<count;i++){
  const sourceIndex=d.first+i,source=await readFile(resolve(input,d.folder,`${String(sourceIndex).padStart(3,'0')}.png`));
  const crop=i===0||i===count-1?neutral:await sharp(source).extract({left:180,top:153,width:366,height:460}).png().toBuffer();
  const tile=await sharp(crop).resize({width:244}).extend({top:0,bottom:1,left:0,right:0,background:'#00000000'}).png().toBuffer();
  const rgba=await sharp(tile).ensureAlpha().raw().toBuffer();
  for(let x=0;x<tileWidth;x++)for(const y of[0,tileHeight-1])assert.equal(rgba[(y*tileWidth+x)*4+3],0,'Row gutter clipped');
  for(let y=0;y<tileHeight;y++)for(const x of[0,tileWidth-1])assert.equal(rgba[(y*tileWidth+x)*4+3],0,'Column gutter clipped');
  tiles.push(tile);frames.push({index:i,sourceIndex,sourcePngSha256:hash(source)});
  composites.push({input:tile,left:i%columns*tileWidth,top:Math.floor(i/columns)*tileHeight});
 }
 const xmp=`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="AI-generated with Kling Video 3.0; source ProduceID ${d.produceId}; whole-frame ${action}; preserved original video"/></rdf:RDF></x:xmpmeta>`;
 const bytes=await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(composites).webp({quality:92,alphaQuality:100,effort:6}).withXmp(xmp).toBuffer();
 assert.ok(bytes.length<2*1024*1024,'Download exceeds per-action budget');
 const decoded=await sharp(bytes).ensureAlpha().raw().toBuffer();let maxError=0;
 for(let i=0;i<count;i++){
  const expected=await sharp(tiles[i]).ensureAlpha().raw().toBuffer(),actual=Buffer.alloc(expected.length);let error=0,n=0;
  for(let y=0;y<tileHeight;y++){const start=((Math.floor(i/columns)*tileHeight+y)*width+i%columns*tileWidth)*4;decoded.copy(actual,y*tileWidth*4,start,start+tileWidth*4);}
  for(let p=0;p<expected.length;p+=4){assert.equal(actual[p+3],expected[p+3]);if(expected[p+3]>200){for(let c=0;c<3;c++)error+=Math.abs(actual[p+c]-expected[p+c]);n+=3;}}
  maxError=Math.max(maxError,error/n);assert.ok(error/n<=3);frames[i].tileRgbaSha256=hash(actual);
 }
 const src='/assistant/'+d.file;await immutableWrite('public'+src,bytes);
 assets[action]={src,width,height,bytes:bytes.length,sha256:hash(bytes),columns,tileWidth,tileHeight,frames:count};
 clips[action]={sourceVideoSha256:d.sourceHash,produceId:d.produceId,fps:24,sourceIndices:frames.map(f=>f.sourceIndex),durationMs:count/24*1000,frames,maxOpaqueRgbMeanError:maxError};
 scopeFrames.push(...frames.map(f=>action+':'+f.tileRgbaSha256));
 for(const[theme,bg]of[['light','#f7f4eb'],['dark','#171b21']]){
  const cells=[];for(let i=0;i<count;i++)cells.push({input:await sharp(tiles[i]).resize({width:122}).flatten({background:bg}).png().toBuffer(),left:i%11*122,top:Math.floor(i/11)*154});
  await writeFile(pack+`/review/${action}-${theme}.png`,await sharp({create:{width:1342,height:Math.ceil(count/11)*154,channels:4,background:bg}}).composite(cells).png().toBuffer());
 }
}
const keptAssets={...old.keptAssets};delete keptAssets.bow;
const manifest={version:2,status:'OWNER_AUTHORIZED_PENDING_ART_AND_BROWSER_GATES',ownerAcceptance:{scope:['wave-palm-correction','bow'],bowMeaning:'鞠躬致谢：礼貌问候、感谢、告别',newGeneratedSamplesReleased:false},processing:{wholeFrame:true,limbCompositing:false,geometryEdits:false,interpolation:false,alphaLossless:true,fixedCrop:{left:180,top:153,width:366,height:460},uniformScale:2/3,fixedRuntimeAnchor:{x:136,y:305},neutralEndpoints:'canonical existing idle',paletteOnlyReport:palette},assets,keptAssets,clips};
manifest.frameScopeSha256=hash(scopeFrames.join('\n'));manifest.assetScopeSha256=hash([...Object.values(assets),...Object.values(keptAssets)].map(a=>a.src+':'+a.sha256).sort().join('\n'));
await immutableWrite(pack+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({assets,frameScopeSha256:manifest.frameScopeSha256,assetScopeSha256:manifest.assetScopeSha256}));
