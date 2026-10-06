import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {LEFT_COLLAR_SHEETS,IDLE_SOURCE_INDICES,IDLE_DRAWING_TIMES} from "./left-collar-sheets";
const base="docs/assistant/left-collar-release-v1/";
const hash=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const json=async(name:string)=>JSON.parse(await readFile(base+name,"utf8"));
function equalVisible(a:Buffer,b:Buffer){assert.equal(a.length,b.length);for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3]);if(b[i+3])assert.ok(a.subarray(i,i+3).equals(b.subarray(i,i+3)));}}
test("left-collar release binds art scope to actual assets without approving the rejected native eye rig",async()=>{
  const m=await json("atlas-candidate.json"),a=await json("review/art-review.json"),c=await json("source-candidate.json");
  assert.equal(a.status,"APPROVED_SCOPED_FINISH");assert.equal(a.nativeIntermediateRig,"REJECTED_RETAINED");
  assert.equal(a.legacyBodyArtReapproved,false);assert.equal(a.futureVersionsAuthorized,false);
  assert.equal(a.finishedScopeSha256,hash(c.frameHashes.join("")));assert.equal(a.nativeSourceScopeSha256,hash(c.sourceHashes.join("")));
  assert.equal(a.assetScopeSha256,hash(Object.values(m.assets).map((v:unknown)=>{const x=v as {src:string;sha256:string};return x.src+":"+x.sha256;}).sort().join("\n")));
  for(const[key,asset]of Object.entries(m.assets)){
    const x=asset as {src:string;sha256:string;bytes:number;width?:number;height?:number};const bytes=await readFile("public"+x.src);
    assert.equal(hash(bytes),x.sha256);assert.equal(bytes.length,x.bytes);
    if(key!=="fallback"){const sheet=LEFT_COLLAR_SHEETS[key as keyof typeof LEFT_COLLAR_SHEETS];assert.equal(sheet.src,x.src);const meta=await sharp(bytes).metadata();assert.equal(meta.pages??1,1);assert.equal(meta.width,sheet.width);assert.equal(meta.height,sheet.height);assert.equal(meta.hasAlpha,true);}
  }
});
test("all 67 idle slots are exact fixed crops, with 30 fps blink steps and static soles",async()=>{
  const m=await json("atlas-candidate.json"),c=await json("source-candidate.json"),asset=m.assets["pilot-blink"];
  assert.deepEqual(asset.sourceIndices,IDLE_SOURCE_INDICES);assert.deepEqual(m.idleTimes,IDLE_DRAWING_TIMES);
  const atlas=await readFile("public"+asset.src);let first:Buffer|undefined;
  for(const[i,index]of IDLE_SOURCE_INDICES.entries()){
    const png=await readFile(base+`frames/idle/${String(index).padStart(3,"0")}.png`);assert.equal(hash(png),c.frameHashes[index]);
    const pixels=await sharp(png).ensureAlpha().raw().toBuffer();first??=pixels;
    for(let y=554;y<768;y++)equalVisible(pixels.subarray(y*768*4,(y+1)*768*4),first.subarray(y*768*4,(y+1)*768*4));
    const expected=await sharp(png).extract(c.rect).ensureAlpha().raw().toBuffer();
    const actual=await sharp(atlas).extract({left:i%6*366,top:Math.floor(i/6)*460,width:366,height:460}).ensureAlpha().raw().toBuffer();equalVisible(actual,expected);
  }
  const final=await sharp(base+"frames/idle/120.png").ensureAlpha().raw().toBuffer();assert.ok(final.equals(first!));
  for(let i=1;i<IDLE_DRAWING_TIMES.length;i++)assert.ok(IDLE_DRAWING_TIMES[i]>IDLE_DRAWING_TIMES[i-1]);
  assert.ok(IDLE_DRAWING_TIMES.at(-1)!<4000);assert.equal(IDLE_DRAWING_TIMES[IDLE_SOURCE_INDICES.indexOf(41)],41*1000/30);
});
test("legacy actions change only the registered badge rectangles, not face, hands or footwear",async()=>{
  const m=await json("atlas-candidate.json");
  for(const[key,value]of Object.entries(m.assets)){
    if(key==="pilot-blink"||key==="fallback")continue;
    const a=value as {sourceSrc:string;src:string;sourceSha256:string;width:number;height:number;placements:Array<{left:number;top:number;width:number;height:number}>};
    const original=await readFile("public"+a.sourceSrc);assert.equal(hash(original),a.sourceSha256);
    const before=await sharp(original).ensureAlpha().raw().toBuffer(),after=await sharp("public"+a.src).ensureAlpha().raw().toBuffer();
    const mask=new Uint8Array(a.width*a.height);for(const p of a.placements)for(let y=p.top;y<p.top+p.height;y++)for(let x=p.left;x<p.left+p.width;x++)mask[y*a.width+x]=1;
    for(let i=0;i<mask.length;i++)if(!mask[i]){const n=i*4;assert.equal(before[n+3],after[n+3]);if(before[n+3])assert.ok(before.subarray(n,n+3).equals(after.subarray(n,n+3)));}
  }
});
