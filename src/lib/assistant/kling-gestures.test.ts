import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {CHARACTER_ACTIONS} from "./character";
import {DRAWING_SEQUENCES, NEUTRAL_DRAWING, drawingDuration, drawingSample, drawingTimes} from "./frame-timeline";
import {KLING_BOW_SHEETS} from "./kling-bow-sheets";
const hash=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const manifest=()=>readFile("docs/assistant/kling-gestures-v2/manifest.json","utf8").then(JSON.parse);

test("gesture approval is limited to palm color and thanks, with no new sample authorization",async()=>{
  const m=await manifest();
  assert.deepEqual(m.ownerAcceptance.scope,["wave-palm-correction","bow"]);
  assert.equal(m.ownerAcceptance.newGeneratedSamplesReleased,false);
  assert.match(m.ownerAcceptance.bowMeaning,/鞠躬致谢/);
  assert.equal(CHARACTER_ACTIONS.bow.label,"鞠躬致谢");
  assert.equal(m.processing.wholeFrame,true);
  for(const key of ["limbCompositing","geometryEdits","interpolation"])assert.equal(m.processing[key],false);
  assert.equal(m.processing.alphaLossless,true);
  const p=m.processing.paletteOnlyReport;
  assert.equal(p.ownerAuthorized,true);assert.equal(p.changedFrames,54);
  for(const key of ["geometryChanges","alphaChanges","outsideMaskChanges"])assert.equal(p[key],0);
  assert.deepEqual(p.fixedRoi,[226,290,324,525]);
  assert.deepEqual(p.rgbDeltaAtFullStrength,[4,25,37]);
  assert.equal(p.frames.length,121);
  for(const f of p.frames){
    assert.equal(f.alphaChanges,0);assert.equal(f.outsideMaskChanges,0);
    assert.equal(f.resultSha256,m.clips.wave.frames[f.index].sourcePngSha256);
    if(f.changedPixels){assert.ok(f.bounds[0]>=226&&f.bounds[1]>=290&&f.bounds[2]<=324&&f.bounds[3]<=525);}
    else assert.equal(f.resultSha256,f.sourceSha256);
  }
  const assets=[...Object.values(m.assets),...Object.values(m.keptAssets)] as {src:string;sha256:string;bytes:number}[];
  for(const a of assets){const bytes=await readFile("public"+a.src);assert.equal(bytes.length,a.bytes);assert.equal(hash(bytes),a.sha256);}
  assert.equal(m.assetScopeSha256,hash(assets.map(a=>a.src+":"+a.sha256).sort().join("\n")));
  assert.equal(m.frameScopeSha256,hash(Object.entries(m.clips).flatMap(([action,c])=>(c as {frames:{tileRgbaSha256:string}[]}).frames.map(f=>action+":"+f.tileRgbaSha256)).join("\n")));
});

test("thanks uses consecutive source frames at native 24fps and exact resting endpoints",async()=>{
  const m=await manifest(),seq=DRAWING_SEQUENCES.bow;
  assert.equal(seq.length,73);assert.equal(drawingDuration("bow"),73/24*1000);
  assert.deepEqual(m.clips.bow.sourceIndices,Array.from({length:73},(_,i)=>i+24));
  assert.deepEqual(seq[0],NEUTRAL_DRAWING);assert.deepEqual(seq.at(-1),NEUTRAL_DRAWING);
  for(const [i,time]of drawingTimes("bow").entries()){
    assert.equal(time,i*1000/24);const sample=drawingSample("bow",time+1);
    assert.equal(sample.mix,1);assert.deepEqual(sample.from,sample.to);assert.deepEqual(sample.to,seq[i]);
  }
  const sheet=KLING_BOW_SHEETS["kling-bow"],bytes=await readFile("public"+sheet.src);
  const info=await sharp(bytes).metadata();assert.equal(info.width,1464);assert.equal(info.height,4004);
  assert.equal(info.pages??1,1);assert.ok(bytes.length<2*1024*1024);assert.match(info.xmp!.toString(),/HB1_PROD_ai_web_323375131217210/);
  const data=await sharp(bytes).ensureAlpha().raw().toBuffer();
  for(const [i,[x,y]]of sheet.poses.entries()){
    const tile=Buffer.alloc(244*308*4);
    for(let row=0;row<308;row++){const start=((y+row)*1464+x)*4;data.copy(tile,row*244*4,start,start+244*4);}
    assert.equal(hash(tile),m.clips.bow.frames[i].tileRgbaSha256);
    for(let px=0;px<244;px++)for(const py of [0,307])assert.equal(tile[(py*244+px)*4+3],0);
    for(let py=0;py<308;py++)for(const px of [0,243])assert.equal(tile[(py*244+px)*4+3],0);
  }
});

test("palm correction retains the complete previously accepted wave silhouette",async()=>{
  const m=await manifest(),a=await sharp("public/assistant/chibi-wave-kling-v1.webp").ensureAlpha().raw().toBuffer();
  const b=await sharp("public"+m.assets.wave.src).ensureAlpha().raw().toBuffer();
  assert.equal(a.length,b.length);
  for(let i=3;i<a.length;i+=4)assert.equal(a[i],b[i],"Palm correction must not change any alpha pixel");
});
