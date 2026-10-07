import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {DRAWING_SEQUENCES, NEUTRAL_DRAWING, drawingDuration, drawingSample, drawingTimes} from "./frame-timeline";
import {KLING_ACTION_COUNTS, KLING_ACTION_SHEETS} from "./kling-action-sheets";
const hash=(b:Uint8Array|string)=>createHash("sha256").update(b).digest("hex");
const manifest=()=>readFile("docs/assistant/kling-actions-v2/manifest.json","utf8").then(JSON.parse);

test("new samples have explicit release authorization and bounded hand-only color edits",async()=>{
  const m=await manifest();
  assert.deepEqual(m.ownerAuthorization.scope,["nod","thinking","cheer","yawn"]);
  assert.equal(m.ownerAuthorization.message,"修正正后部署上线");
  for(const key of ["limbCompositing","geometryEdits","interpolation"])assert.equal(m.processing[key],false);
  assert.equal(m.processing.wholeFrame,true);assert.equal(m.processing.alphaLossless,true);
  const p=m.processing.paletteOnlyReport;assert.equal(p.ownerAuthorized,true);assert.ok(p.changedFrames>0);
  for(const key of["geometryChanges","alphaChanges","outsideMaskChanges"])assert.equal(p[key],0);
  assert.equal(p.frames.length,73);
  for(const f of p.frames){
    assert.equal(f.resultSha256,m.clips.cheer.frames[f.index].preparedPngSha256);
    assert.equal(f.alphaChanges,0);assert.equal(f.outsideMaskChanges,0);
    if(!f.changedPixels)assert.equal(f.resultSha256,f.sourceSha256);
    for(const[x,y,r,b]of f.handComponents){assert.ok(((x>=260&&r<=338)||(x>=447&&r<=515))&&y>=345&&b<=525);}
  }
  // The entire raised-fist apex must be corrected on BOTH sides, not alternate
  // between pale and warm when a hand crosses an overly narrow ROI boundary.
  for(let i=19;i<=40;i++)assert.equal(p.frames[i].handComponents.length,2);
  assert.equal(m.credits.additionalSpend,0);
  const assets=[...Object.values(m.assets),...Object.values(m.keptAssets)] as {src:string;sha256:string;bytes:number}[];
  for(const a of assets){const b=await readFile("public"+a.src);assert.equal(b.length,a.bytes);assert.equal(hash(b),a.sha256);}
  assert.equal(m.assetScopeSha256,hash(assets.map(a=>a.src+":"+a.sha256).sort().join("\n")));
  assert.equal(m.frameScopeSha256,hash(Object.entries(m.clips).flatMap(([action,c])=>(c as {frames:{tileRgbaSha256:string}[]}).frames.map(f=>action+":"+f.tileRgbaSha256)).join("\n")));
});

test("all four native 24fps timelines have complete recovery and canonical endpoints",async()=>{
  const m=await manifest();
  for(const action of Object.keys(KLING_ACTION_COUNTS) as (keyof typeof KLING_ACTION_COUNTS)[]){
    const count=KLING_ACTION_COUNTS[action],seq=DRAWING_SEQUENCES[action];
    assert.equal(seq.length,count);assert.equal(drawingDuration(action),count/24*1000);
    assert.deepEqual(m.clips[action].sourceIndices,Array.from({length:count},(_,i)=>i));
    assert.deepEqual(seq[0],NEUTRAL_DRAWING);assert.deepEqual(seq.at(-1),NEUTRAL_DRAWING);
    for(const[i,time]of drawingTimes(action).entries()){
      assert.equal(time,i*1000/24);const s=drawingSample(action,time+1);
      assert.equal(s.mix,1);assert.deepEqual(s.from,s.to);assert.deepEqual(s.to,seq[i]);
    }
  }
});

test("hash-bound static sheets have lossless alpha, clear gutters, AI provenance and small downloads",async()=>{
  const m=await manifest();
  for(const action of Object.keys(KLING_ACTION_COUNTS) as (keyof typeof KLING_ACTION_COUNTS)[]){
    const sheet=KLING_ACTION_SHEETS[`kling-${action}`],bytes=await readFile("public"+sheet.src),info=await sharp(bytes).metadata();
    assert.equal(info.width,sheet.width);assert.equal(info.height,sheet.height);assert.equal(info.pages??1,1);
    assert.ok(bytes.length<2*1024*1024);assert.ok(info.hasAlpha);assert.match(info.xmp!.toString(),new RegExp(m.clips[action].produceId));
    const data=await sharp(bytes).ensureAlpha().raw().toBuffer();
    for(const[i,[x,y]]of sheet.poses.entries()){
      const tile=Buffer.alloc(244*308*4);
      for(let row=0;row<308;row++){const start=((y+row)*1464+x)*4;data.copy(tile,row*244*4,start,start+244*4);}
      assert.equal(hash(tile),m.clips[action].frames[i].tileRgbaSha256);
      for(let px=0;px<244;px++)for(const py of[0,307])assert.equal(tile[(py*244+px)*4+3],0);
      for(let py=0;py<308;py++)for(const px of[0,243])assert.equal(tile[(py*244+px)*4+3],0);
    }
  }
});
