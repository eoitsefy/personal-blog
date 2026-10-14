import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import frameIndex from "./releases/h3-v2/source-frame-hashes.json";
import { H3_CLIPS,H3_MOTION,H3MotionClock,h3Action,validH3Motion } from "./h3-motion";
import { createH3Presence,reduceH3Presence,H3_REST_AFTER_MS,H3_SIP_AFTER_MS } from "./h3-presence";

test("all 24 selected clips have exact alpha, valid timings and honest authorization metadata",()=>{
  assert(validH3Motion(H3_MOTION)); assert.equal(Object.keys(H3_MOTION.clips).length,24);
  assert.equal(H3_MOTION.review.aiArtReview,false); assert.equal(h3Action("bow"),"thanks");
  for (const name of H3_CLIPS) assert.equal(H3_MOTION.clips[name].frames,H3_MOTION.clips[name].durations.length);
});
test("every shipped H3 atlas and still matches its complete release hash",()=>{
  for (const asset of [...Object.values(H3_MOTION.assets),...Object.values(H3_MOTION.stills)]) {
    const data=readFileSync(`public${asset.src}`);
    assert.equal(createHash("sha256").update(data).digest("hex"),asset.sha256,asset.src);
  }
});
test("all deployed RGBA crops reproduce original delivered frames, including translucent edges",async()=>{
  for (const name of H3_CLIPS) {
    const clip=H3_MOTION.clips[name],hashes=frameIndex.rgbaSourceFrameHashes[name];
    assert.equal(hashes.length,clip.frames);
    for (let page=0;page<clip.pages.length;page++) {
      const asset=H3_MOTION.assets[clip.pages[page]];
      const {data,info}=await sharp(`public${asset.src}`).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
      assert.equal(info.channels,4);
      for (let slot=0;slot<8 && page*8+slot<clip.frames;slot++) {
        const frame=Buffer.alloc(480*480*4),x=(slot%4)*480,y=Math.floor(slot/4)*480;
        for(let row=0;row<480;row++) {
          const offset=((y+row)*info.width+x)*4;
          data.copy(frame,row*480*4,offset,offset+480*4);
        }
        assert.equal(createHash("sha256").update(frame).digest("hex"),hashes[page*8+slot],`${name} frame ${page*8+slot}`);
      }
    }
  }
});
test("idle and gestures finish naturally; no reverse frames or forced end replacement",()=>{
  const clock=new H3MotionClock(H3_MOTION),done:number[]=[];
  clock.sample(0,id=>done.push(id)); clock.request({ clip:"wave",playId:1 });
  assert.equal(clock.sample(100,id=>done.push(id)).clip,"idle-blink");
  const start=H3_MOTION.clips["idle-blink"].durationMs;
  assert.equal(clock.sample(start,id=>done.push(id)).frame,0);
  clock.request({ clip:"nod",playId:2 });
  assert.equal(clock.sample(start+100,id=>done.push(id)).clip,"wave");
  assert.equal(clock.sample(start+H3_MOTION.clips.wave.durationMs,id=>done.push(id)).clip,"nod");
  assert.deepEqual(done,[1]);
});
test("completed scene state holds its actual last frame until the owner advances",()=>{
  const clock=new H3MotionClock(H3_MOTION),done:number[]=[];
  clock.request({ clip:"bed-change",playId:-3 }); clock.sample(0,id=>done.push(id));
  const end=H3_MOTION.clips["bed-change"].durationMs;
  assert.equal(clock.sample(end+100,id=>done.push(id)).frame,H3_MOTION.clips["bed-change"].frames-1);
  clock.sample(end+200,id=>done.push(id)); assert.deepEqual(done,[-3]);
});
test("night workflow cannot skip outfit/headset/bedside states when clicked mid-entry",()=>{
  let s=reduceH3Presence(createH3Presence(),{ type:"availability",enabled:true,now:0 });
  s=reduceH3Presence(s,{ type:"tick",hour:23,now:H3_REST_AFTER_MS });
  s=reduceH3Presence(s,{ type:"click",now:H3_REST_AFTER_MS+1 });
  const sequence:string[]=[];
  for (let i=0;i<15 && s.phase!=="awake";i++) {
    sequence.push(s.clip!); s=reduceH3Presence(s,{ type:"finished",cycle:s.cycle,now:H3_REST_AFTER_MS+100+i });
  }
  assert.deepEqual(sequence,["bed-pull","bed-change","headset-off","bed-enter","bed-wake","headset-on","bed-change-back","bed-remove","yawn"]);
  assert.equal(s.phase,"awake");
});
test("day rest loops, drinks occasionally, and exits through standing and wardrobe",()=>{
  let s=reduceH3Presence(createH3Presence(),{ type:"availability",enabled:true,now:0 });
  s=reduceH3Presence(s,{ type:"tick",hour:14,now:H3_REST_AFTER_MS });
  while(s.phase==="entering") s=reduceH3Presence(s,{ type:"finished",cycle:s.cycle,now:H3_REST_AFTER_MS+1 });
  assert.equal(s.clip,"beach-loop");
  s=reduceH3Presence(s,{ type:"tick",hour:14,now:s.lastActivityAt+H3_SIP_AFTER_MS }); assert.equal(s.clip,"coconut-sip");
  s=reduceH3Presence(s,{ type:"finished",cycle:s.cycle,now:s.lastActivityAt+1 }); assert.equal(s.clip,"beach-loop");
  s=reduceH3Presence(s,{ type:"click",now:s.lastActivityAt+1 });
  const sequence:string[]=[];
  while(s.phase!=="awake") { sequence.push(s.clip!); s=reduceH3Presence(s,{ type:"finished",cycle:s.cycle,now:s.lastActivityAt+1 }); }
  assert.deepEqual(sequence,["beach-stand","beach-change-back","beach-remove"]);
});
test("paused clocks retain phase and stale scene completions are ignored",()=>{
  const clock=new H3MotionClock(H3_MOTION); clock.sample(0,()=>{}); const first=clock.sample(100,()=>{});
  clock.delay(3000); assert.equal(clock.sample(3100,()=>{}).frame,first.frame);
  const s=createH3Presence(); assert.equal(reduceH3Presence(s,{ type:"finished",cycle:999,now:100 }),s);
});
