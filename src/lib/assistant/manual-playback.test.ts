import assert from "node:assert/strict";
import test from "node:test";
import { createManualPlayback, reduceManualPlayback } from "./manual-playback";
import { createH3Presence, reduceH3Presence } from "./h3-presence";

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

test("manual choice waits while a resting scene exits through its original clips", () => {
  let scene = createH3Presence();
  scene = reduceH3Presence(scene, { type: "availability", enabled: true, now: 0 });
  scene = reduceH3Presence(scene, { type: "tick", hour: 23, now: 61_000 });
  const first = scene.clip;
  assert.equal(scene.phase, "entering");
  scene = reduceH3Presence(scene, { type: "click", now: 61_010 });
  scene = reduceH3Presence(scene, { type: "availability", enabled: false, now: 61_010 });
  assert.equal(scene.clip, first);
  const visited: string[] = [];
  for (let guard = 0; scene.phase !== "awake" && guard < 30; guard++) {
    if (scene.clip) visited.push(scene.clip);
    scene = reduceH3Presence(scene, { type: "finished", cycle: scene.cycle, now: 62_000 + guard * 6_000 });
  }
  assert.equal(scene.phase, "awake");
  assert.ok(visited.includes("bed-wake"));
  assert.ok(visited.includes("headset-on"));
  assert.equal(reduceManualPlayback(createManualPlayback(), { type: "select", action: "idle" }).request?.action, "idle");
});

test("returning to automatic cancels only the request and keeps ids unique", () => {
  let state = reduceManualPlayback(createManualPlayback(), { type: "select", action: "idle" });
  const oldId = state.request!.playId;
  state = reduceManualPlayback(state, { type: "automatic" });
  state = reduceManualPlayback(state, { type: "select", action: "idle" });
  assert.ok(state.request!.playId > oldId);
  assert.equal(reduceManualPlayback(state, { type: "finished", playId: oldId }), state);
});
