import assert from "node:assert/strict";
import test from "node:test";
import { createManualPlayback, reduceManualPlayback } from "./manual-playback";

test("a newer manual choice survives stale scene and previous-action completions", () => {
  let state = reduceManualPlayback(createManualPlayback(), { type: "select", action: "wave" });
  const previous = state.request!.playId;
  state = reduceManualPlayback(state, { type: "select", action: "thinking" });
  for (const playId of [-5, 3, previous]) {
    assert.equal(reduceManualPlayback(state, { type: "finished", playId }), state);
  }
  assert.equal(state.request?.action, "thinking");
  assert.equal(reduceManualPlayback(state, { type: "finished", playId: state.request!.playId }).request, null);
});

test("a manual choice remains pending until that exact basic action completes", () => {
  const pending = reduceManualPlayback(createManualPlayback(), { type:"select", action:"idle" });
  assert.equal(pending.request?.action, "idle");
  assert.equal(reduceManualPlayback(pending, { type:"finished", playId:-1 }), pending);
  assert.equal(reduceManualPlayback(pending, { type:"finished", playId:pending.request!.playId }).request, null);
});

test("returning to automatic cancels only the request and keeps ids unique", () => {
  let state = reduceManualPlayback(createManualPlayback(), { type: "select", action: "idle" });
  const oldId = state.request!.playId;
  state = reduceManualPlayback(state, { type: "automatic" });
  state = reduceManualPlayback(state, { type: "select", action: "idle" });
  assert.ok(state.request!.playId > oldId);
  assert.equal(reduceManualPlayback(state, { type: "finished", playId: oldId }), state);
});
