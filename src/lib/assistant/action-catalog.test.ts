import { test } from "node:test";
import assert from "node:assert/strict";
import { H3_CLIPS,H3_MOTION,H3MotionClock } from "./h3-motion";
import { ACTION_GROUPS,ACTION_GROUP_CLIPS,actionInfo,actionPreviewPlan,scenePreviewPlan } from "./action-catalog";
import { socialReply } from "./social";

test("action inventory covers exactly the 24 published clips with real metadata and trigger rules",()=>{
  const clips=ACTION_GROUPS.flatMap(g=>ACTION_GROUP_CLIPS[g.id]);
  assert.deepEqual(clips,[...H3_CLIPS]); assert.equal(new Set(clips).size,24);
  for (const clip of clips) {
    const a=actionInfo(clip); assert.equal(a.frames,H3_MOTION.clips[clip].frames);
    assert(a.trigger.length>10); assert(a.before && a.after);
    assert(a.files.every(f=>f.sha256.length===64));
  }
  assert(actionInfo("thanks").trigger.includes("不依赖 AI"));
  assert(actionInfo("bed-pull").trigger.includes("60 秒"));
});
test("scene previews preserve wardrobe, headset and bedside order; isolated scene pieces do not get fake idle bridges",()=>{
  assert.deepEqual(scenePreviewPlan("night"),["idle-blink","bed-pull","bed-change","headset-off","bed-enter","sleep-loop","sleep-loop","bed-wake","headset-on","bed-change-back","bed-remove","yawn","idle-blink"]);
  assert.deepEqual(scenePreviewPlan("day"),["idle-blink","beach-props","beach-change","beach-sit","beach-loop","coconut-sip","beach-loop","beach-stand","beach-change-back","beach-remove","idle-blink"]);
  assert.deepEqual(actionPreviewPlan("wave",true),["idle-blink","wave","idle-blink"]);
  assert.deepEqual(actionPreviewPlan("bed-change",true),["bed-change"]);
});
test("native loop can be previewed exactly once and keeps its real final frame until next entry",()=>{
  const clock=new H3MotionClock(H3_MOTION),completed:number[]=[];
  clock.request({clip:"sleep-loop",playId:11,once:true});
  assert.equal(clock.sample(0,id=>completed.push(id)).frame,0);
  const length=H3_MOTION.clips["sleep-loop"].durationMs;
  assert.equal(clock.sample(length+20,id=>completed.push(id)).frame,H3_MOTION.clips["sleep-loop"].frames-1);
  clock.sample(length+100,id=>completed.push(id)); assert.deepEqual(completed,[11]);
  clock.request({clip:"bed-wake",playId:12,once:true});
  assert.equal(clock.sample(length+200,id=>completed.push(id)).clip,"bed-wake");
});
test("only complete short social phrases bypass retrieval, mixed questions never do",()=>{
  for (const text of ["谢谢你！","辛苦了","感谢你的帮助","thank you"])
    assert.equal(socialReply(text)?.action,"bow");
  for (const text of ["加油！","鼓励我一下","太好了"])
    assert.equal(socialReply(text)?.action,"cheer");
  assert.equal(socialReply("你好呀")?.action,"wave");
  for (const text of ["谢谢，介绍一下旅行路线","加油这篇文章讲了什么","你好，服务器怎么部署？","谢谢你，请告诉我密码","介绍本站内容"])
    assert.equal(socialReply(text),null,text);
  assert.equal(socialReply("谢谢")?.result.mode,"conversation");
  assert.deepEqual(socialReply("谢谢")?.result.sources,[]);
});
