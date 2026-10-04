import assert from "node:assert/strict";
import {test} from "node:test";
import {RIG_PARTS,RIG_SKINS,RIG_STAGE,rigSample,solveArm} from "./rig";
import sharp from "sharp";
test("continuous curves produce real intermediate joint poses without root movement",()=>{
  for(const action of ["wave","yawn"] as const){
    const poses=Array.from({length:120},(_,i)=>rigSample(action,i*12));
    assert.ok(new Set(poses.map(p=>p.left.x.toFixed(5)+","+p.left.y.toFixed(5))).size>90);
    assert.ok(poses.every(p=>Object.values(p).filter(v=>typeof v==="number").every(Number.isFinite)));
  }
  assert.equal(RIG_STAGE.rootX,112); assert.equal(RIG_STAGE.baseline,216);
});
test("motions are skin-neutral, yawning closes eyes and opens mouth then returns idle",()=>{
  assert.equal("skin" in rigSample("yawn",1300),false);
  assert.deepEqual(rigSample("idle",NaN),rigSample("idle",0));
  assert.deepEqual(rigSample("idle",-100),rigSample("idle",0));
  assert.ok(rigSample("yawn",1300).mouth>.9);
  assert.ok(rigSample("yawn",1300).blink>.9);
  assert.equal(rigSample("yawn",2600).playing,"idle");
  assert.equal(rigSample("wave",1800).playing,"idle");
  assert.deepEqual(rigSample("yawn",1300,true).left,rigSample("idle",0,true).left);
});
test("IK preserves bone lengths and clamps unreachable targets",()=>{
  for(const target of [{x:-46,y:-91},{x:-1,y:-63},{x:-33,y:-3},{x:1000,y:1000},{x:-29,y:-47}]){
    const s={x:-29,y:-47},a=solveArm(s,target,-1);
    assert.ok(Math.abs(Math.hypot(a.elbow.x-s.x,a.elbow.y-s.y)-24)<1e-6);
    assert.ok(Math.abs(Math.hypot(a.wrist.x-a.elbow.x,a.wrist.y-a.elbow.y)-23)<1e-6);
    assert.ok(Math.hypot(a.wrist.x-s.x,a.wrist.y-s.y)<47);
  }
});
test("all skins expose the same fully bounded attachment slots",()=>{
  for(const skin of Object.values(RIG_SKINS)){
    assert.equal(skin.parts.length,RIG_PARTS.length);
    assert.match(skin.src,/^\/assistant\/rig-[a-z]+-v1\.png$/);
    for(const [x,y,w,h]of skin.parts) assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=skin.width&&y+h<=skin.height);
  }
});
test("both original skin atlases have real alpha and populated attachment crops",async()=>{
  for(const skin of Object.values(RIG_SKINS)){
    const {data,info}=await sharp("public"+skin.src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,skin.width);assert.equal(info.height,skin.height);
    let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
    assert.ok(transparent>info.width*info.height*.5);
    for(const [x,y,w,h]of skin.parts){
      let pixels=0;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(data[(yy*info.width+xx)*4+3]>100)pixels++;
      assert.ok(pixels>50);
    }
  }
});
