import assert from "node:assert/strict";
import test from "node:test";
import { createBehaviorState, reduceBehavior, nextBehaviorDeadline, responseAction, BEHAVIOR_TIMING } from "./behavior";

const ready = () => reduceBehavior(createBehaviorState(), { type: "availability", enabled: true, now: 0 });
const conversation = { mode: "conversation", confidence: "high", sources: [] } as const;

test("opening greets once per minute and stale completion cannot erase another cue", () => {
  const first = reduceBehavior(ready(), { type: "open", now: 100 });
  assert.equal(first.action, "wave");
  const closed = reduceBehavior(first, { type: "close", now: 200 });
  const again = reduceBehavior(closed, { type: "open", now: 300 });
  assert.equal(again.action, "wave"); assert.equal(again.playId,first.playId);
  const later = reduceBehavior(again, { type: "open", now: 60_100 });
  assert.equal(later.action, "wave");
  assert.equal(reduceBehavior(later, { type: "finished", playId: first.playId, now: 60_200 }), later);
  assert.equal(reduceBehavior(later, { type: "finished", playId: later.playId, now: 65_200 }).action, "idle");
});

test("fast answers skip thinking and long queries think once every twelve seconds", () => {
  const waiting = reduceBehavior(ready(), { type: "submit", now: 100 });
  assert.equal(waiting.action, "idle");
  assert.equal(nextBehaviorDeadline(waiting), 700);
  assert.equal(reduceBehavior(waiting, { type: "tick", now: 699 }), waiting);
  const quick = reduceBehavior(waiting, { type: "answer", action: "nod", now: 400 });
  assert.equal(quick.pending, false); assert.equal(quick.action, "nod");
  const thinking = reduceBehavior(waiting, { type: "tick", now: 700 });
  assert.equal(thinking.action, "thinking"); assert.equal(nextBehaviorDeadline(thinking), null);
  const rest = reduceBehavior(thinking, { type: "finished", playId: thinking.playId, now: 3800 });
  assert.equal(rest.action, "idle"); assert.equal(nextBehaviorDeadline(rest), 12_700);
  assert.equal(reduceBehavior(rest, { type: "tick", now: 12_699 }), rest);
  assert.equal(reduceBehavior(rest, { type: "tick", now: 12_700 }).action, "thinking");
});

test("answer interrupts thinking and response gestures have a cooldown", () => {
  let state = reduceBehavior(ready(), { type: "submit", now: 100 });
  state = reduceBehavior(state, { type: "tick", now: 700 });
  const done = reduceBehavior(state, { type: "answer", action: "cheer", now: 1100 });
  assert.equal(done.action, "cheer"); assert.equal(done.pending, false);
  assert.equal(reduceBehavior(done, { type: "answer", action: "bow", now: 1500 }).action, "idle");
  assert.equal(reduceBehavior(done, { type: "answer", action: "bow", now: 9100 }).action, "bow");
});

test("typing postpones idle gestures, yawns never run while pending or repeat frequently", () => {
  const active = reduceBehavior(ready(), { type: "activity", now: 74_000 });
  assert.equal(nextBehaviorDeadline(active), 109_000);
  assert.equal(reduceBehavior(active, { type: "tick", now: 75_000 }), active);
  const yawn = reduceBehavior(active, { type: "tick", now: 109_000 });
  assert.equal(yawn.action, "yawn");
  const rest = reduceBehavior(yawn, { type: "finished", playId: yawn.playId, now: 113_100 });
  assert.equal(nextBehaviorDeadline(rest), 199_000);
  assert.equal(reduceBehavior(yawn, { type: "activity", now: 150_000 }).action, "idle");
  const pending = reduceBehavior(active, { type: "submit", now: 149_000 });
  assert.equal(reduceBehavior(pending, { type: "tick", now: 500_000 }).action, "thinking");
});

test("pause, hidden tabs and reduced motion cancel cues and resume without catch-up", () => {
  const wave = reduceBehavior(ready(), { type: "open", now: 10 });
  const paused = reduceBehavior(wave, { type: "availability", enabled: false, now: 100 });
  assert.equal(paused.action, "idle"); assert.equal(nextBehaviorDeadline(paused), null);
  assert.equal(reduceBehavior(paused, { type: "tick", now: 1_000_000 }), paused);
  const resumed = reduceBehavior(paused, { type: "availability", enabled: true, now: 1_000_000 });
  assert.equal(resumed.action, "idle"); assert.equal(nextBehaviorDeadline(resumed), 1_035_000);
  const hiddenQuery = reduceBehavior(paused, { type: "submit", now: 200 });
  const visible = reduceBehavior(hiddenQuery, { type: "availability", enabled: true, now: 300 });
  assert.equal(nextBehaviorDeadline(visible), 300 + BEHAVIOR_TIMING.thinkingDelay);
  assert.equal(reduceBehavior(paused, { type: "answer", action: "cheer", now: 200 }).action, "idle");
});

test("arrival waves once, reading acknowledges only idle visible-ready state",()=>{
  const arrival=reduceBehavior(ready(),{type:"arrive",now:1200});
  assert.equal(arrival.action,"wave");
  assert.equal(reduceBehavior(arrival,{type:"reading",now:12000}),arrival);
  const idle=reduceBehavior(arrival,{type:"finished",playId:arrival.playId,now:7000});
  const reading=reduceBehavior(idle,{type:"reading",now:12000});
  assert.equal(reading.action,"nod");
  const next=reduceBehavior(reading,{type:"finished",playId:reading.playId,now:18000});
  assert.equal(reduceBehavior(next,{type:"reading",now:20000}),next);
  assert.equal(reduceBehavior(next,{type:"reading",now:60000}).action,"nod");
  const waiting=reduceBehavior(next,{type:"submit",now:20000});
  assert.equal(reduceBehavior(waiting,{type:"reading",now:90000}),waiting);
});

test("courtesy after a factual reply has its own cooldown, no fabricated factual affirmation",()=>{
  const reply=reduceBehavior(ready(),{type:"answer",action:"nod",now:1000});
  const thanks=reduceBehavior(reply,{type:"social",action:"bow",now:2000});
  assert.equal(thanks.action,"bow");
  assert.equal(reduceBehavior(thanks,{type:"close",now:2050}).action,"bow");
  assert.equal(reduceBehavior(thanks,{type:"social",action:"cheer",now:2100}).action,"bow");
  assert.equal(reduceBehavior(thanks,{type:"social",action:"cheer",now:9000}).action,"cheer");
  const disabled=reduceBehavior(thanks,{type:"availability",enabled:false,now:3000});
  assert.equal(reduceBehavior(disabled,{type:"social",action:"cheer",now:9000}).action,"idle");
});

test("social gesture during wardrobe/bed exit waits for availability and is not lost on close",()=>{
  const resting=reduceBehavior(ready(),{type:"availability",enabled:false,now:1000});
  const thanks=reduceBehavior(resting,{type:"social",action:"bow",now:2000});
  assert.equal(thanks.action,"idle"); assert.equal(thanks.deferredSocial,"bow");
  const closed=reduceBehavior(thanks,{type:"close",now:2100});
  const resumed=reduceBehavior(closed,{type:"availability",enabled:true,now:30000});
  assert.equal(resumed.action,"bow"); assert.equal(resumed.deferredSocial,null);
  const cleared=reduceBehavior(thanks,{type:"clear",now:2200});
  assert.equal(reduceBehavior(cleared,{type:"availability",enabled:true,now:30000}).action,"idle");
});

test("close, clear and errors always stop thinking without a cheerful success cue", () => {
  let state = reduceBehavior(ready(), { type: "submit", now: 100 });
  state = reduceBehavior(state, { type: "tick", now: 700 });
  for (const type of ["close", "clear", "error"] as const) {
    const stopped = reduceBehavior(state, { type, now: 1000 });
    assert.equal(stopped.action, "idle"); assert.equal(stopped.pending, false);
    assert.ok(nextBehaviorDeadline(stopped)! > 1000);
  }
});

test("response gesture selection is local, contextual and never celebrates missing evidence", () => {
  const summary = { ...conversation, sources: [] };
  assert.equal(responseAction("谢谢你", summary), "bow");
  assert.equal(responseAction("thanks!", summary), "bow");
  assert.equal(responseAction("太好了", summary), "cheer");
  assert.equal(responseAction("你好", summary), "nod");
  assert.equal(responseAction("太好了", { ...summary, mode: "no_evidence" }), "idle");
  assert.equal(responseAction("谢谢", { ...summary, confidence: "low" }), "idle");
  assert.equal(responseAction("太好了", { ...summary, mode: "grounded" }), "idle");
  assert.equal(responseAction("太好了", { ...summary, mode: "grounded", sources: [{ postId: "a", title: "a", url: "/posts/a", excerpt: "a" }] }), "nod");
});
