import { test } from "node:test";
import assert from "node:assert/strict";
import { H3_CLIPS,H3_MOTION,H3MotionClock } from "./h3-motion";
import { ACTION_GROUPS,ACTION_GROUP_CLIPS,actionInfo,actionPreviewPlan } from "./action-catalog";
import { socialReply } from "./social";

test("action inventory covers exactly the seven published basic clips with real metadata and trigger rules",()=>{
  const clips=ACTION_GROUPS.flatMap(g=>ACTION_GROUP_CLIPS[g.id]);
  assert.deepEqual(clips,[...H3_CLIPS]); assert.equal(new Set(clips).size,7);
  for (const clip of clips) {
    const a=actionInfo(clip); assert.equal(a.frames,H3_MOTION.clips[clip].frames);
    assert(a.trigger.length>10); assert(a.before && a.after);
    assert(a.files.every(f=>f.sha256.length===64));
  }
  assert(actionInfo("thanks").trigger.includes("不依赖 AI"));
});
test("resource preview plans retain full basic cycles without retired day/night controls", () => {
  assert.deepEqual(ACTION_GROUPS.map(group => group.id), ["basic"]);
  assert.deepEqual(actionPreviewPlan("wave", true), ["idle-blink", "wave", "idle-blink"]);
  assert.deepEqual(actionPreviewPlan("idle-blink", true), ["idle-blink"]);
  assert.deepEqual(actionPreviewPlan("thinking", false), ["thinking"]);
  const clock = new H3MotionClock(H3_MOTION), completed: number[] = [];
  clock.request({clip:"idle-blink", playId:11, once:true}); clock.sample(0, id => completed.push(id));
  clock.sample(H3_MOTION.clips["idle-blink"].durationMs + 1, id => completed.push(id));
  assert.deepEqual(completed, [11]);
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
