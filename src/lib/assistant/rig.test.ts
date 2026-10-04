import assert from "node:assert/strict";
import {test} from "node:test";
import {RIG_PARTS,RIG_SKINS,RIG_STAGE,drawRig,rigEyeMask,rigSample,solveArm} from "./rig";
import sharp from "sharp";
test("continuous curves produce real intermediate joint poses without root movement",()=>{
  for(const action of ["wave","yawn"] as const){
    // Sample the lifting phase; yawning intentionally holds the hand at the mouth.
    const poses=Array.from({length:120},(_,i)=>rigSample(action,i*(action==="yawn"?5:12)));
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
  assert.deepEqual(rigSample("yawn",1000).left,rigSample("yawn",1800).left);
  assert.equal(rigSample("yawn",1300).left.x,0);
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
    assert.match(skin.src,/^\/assistant\/rig-[a-z]+-v2\.png$/);
    assert.equal(skin.geometry.version,"identity-v2");
    for(const [x,y,w,h]of skin.parts) assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=skin.width&&y+h<=skin.height);
  }
});
test("neutral hands relax, gestures are continuous and artwork stays proportional",()=>{
  const neutral=rigSample("idle",0,true);
  assert.equal(neutral.wristLeft,0);assert.equal(neutral.wristRight,0);
  assert.equal(neutral.leftGesture,0);assert.equal(neutral.rightGesture,0);
  assert.ok(rigSample("wave",400).leftGesture>.9);
  assert.equal(rigSample("wave",1800).leftGesture,0);
  assert.ok(Math.abs(rigSample("wave",300).leftGesture-rigSample("wave",301).leftGesture)<.01);
  for(const skin of Object.values(RIG_SKINS)){
    const g=skin.geometry,s={x:-g.shoulder.x,y:g.shoulder.y};
    const arm=solveArm(s,neutral.left,-1,g.upper,g.lower);
    const dx=neutral.left.x-s.x,dy=neutral.left.y-s.y,distance=Math.hypot(dx,dy);
    assert.ok(distance/(g.upper+g.lower)>.985,"Neutral arms must hang nearly straight, not akimbo");
    const sideways=Math.abs(dx*(arm.elbow.y-s.y)-dy*(arm.elbow.x-s.x))/distance;
    assert.ok(sideways<3,"Neutral elbows may not stick far outside the shoulder-wrist line");
    const calls:number[][]=[];
    const eyeAlpha:number[]=[];
    const ctx={save(){},restore(){},translate(){},rotate(){},clearRect(){},beginPath(){},rect(){},clip(){},globalAlpha:1,
      drawImage(this:{globalAlpha:number},_image:CanvasImageSource,...args:number[]){calls.push(args);
        if(skin.parts.slice(8,12).some(r=>r[0]===args[0]&&r[1]===args[1]))eyeAlpha.push(this.globalAlpha);}} as unknown as CanvasRenderingContext2D;
    for(const pose of [neutral,rigSample("yawn",1200),rigSample("idle",5280),...[.16,.35,.6,.74,1].map(blink=>({...neutral,blink}))]){
      calls.length=0;drawRig(ctx,{} as CanvasImageSource,skin,pose);
      for(const [, ,sw,sh,,,dw,dh] of calls)assert.ok(Math.abs(dw/sw-dh/sh)<1e-10,"No independent axis stretching");
      const legs=calls.filter(([x,y])=>skin.parts.slice(6,8).some(r=>r[0]===x&&r[1]===y));
      assert.equal(legs.length,2);for(const leg of legs)assert.equal(leg[7],skin.geometry.legHeight);
    }
    assert.ok(eyeAlpha.length>0&&eyeAlpha.every(alpha=>alpha===1),"Eye paintings stay opaque; blink uses a mask, never a whole-eye crossfade");
    const open=rigEyeMask(g,skin.parts[8],0),closed=rigEyeMask(g,skin.parts[8],1);
    assert.deepEqual(rigEyeMask(g,skin.parts[8],NaN),open);
    assert.deepEqual(rigEyeMask(g,skin.parts[8],-1),open);
    assert.deepEqual(rigEyeMask(g,skin.parts[8],2),closed);
    assert.equal(closed.openHeight,0);assert.equal(closed.lidTop,g.closedY);
    for(const amount of [.16,.35,.6,.74]){
      const mask=rigEyeMask(g,skin.parts[8],amount);
      assert.ok(mask.openHeight<open.openHeight&&mask.openTop>open.openTop);
      assert.ok(mask.lidTop>open.lidTop&&mask.lidTop<closed.lidTop);
    }
    for(const mount of Object.values(skin.joints)){
      for(const p of [mount.from,mount.to])assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
      const [x,y,w,h]=mount.cloth;assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);
      assert.ok(mount.from.y>=y&&mount.to.y<=y+h,"Joint overlap stays inside the visible cloth");
    }
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
