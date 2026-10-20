import assert from "node:assert/strict";
import { test } from "node:test";
import { createH3Presence, H3_REST_AFTER_MS, reduceH3Presence } from "./h3-presence";
import { nextH3SceneClip } from "./h3-prefetch";

test("prefetch follows actual day/night completion states including wake requested during entry", () => {
  for (const hour of [14, 23]) for (const earlyWake of [false, true]) {
    let state = reduceH3Presence(createH3Presence(), { type: "availability", enabled: true, now: 0 });
    state = reduceH3Presence(state, { type: "tick", hour, now: H3_REST_AFTER_MS });
    if (earlyWake) state = reduceH3Presence(state, { type: "click", now: H3_REST_AFTER_MS + 1 });
    let steps = 0;
    while (state.phase === "entering" || state.phase === "leaving") {
      const actual = reduceH3Presence(state, { type: "finished", cycle: state.cycle, now: H3_REST_AFTER_MS + ++steps + 1 });
      assert.equal(nextH3SceneClip(state), actual.clip ?? "idle-blink");
      state = actual;
      assert.ok(steps < 20);
    }
    if (state.phase === "resting") {
      assert.equal(nextH3SceneClip(state), undefined, "an unknown wake must not fetch unused exit pages");
      state = reduceH3Presence(state, { type: "click", now: H3_REST_AFTER_MS + ++steps + 1 });
      while (state.phase === "leaving") {
        const actual = reduceH3Presence(state, { type: "finished", cycle: state.cycle, now: H3_REST_AFTER_MS + ++steps + 1 });
        assert.equal(nextH3SceneClip(state), actual.clip ?? "idle-blink");
        state = actual;
      }
    }
    assert.equal(nextH3SceneClip(state), undefined);
  }
});

test("a confirmed drink returns to the beach loop without predicting an unrequested drink", () => {
  const state = { ...createH3Presence(), phase: "resting" as const, scene: "day" as const, clip: "coconut-sip" as const };
  assert.equal(nextH3SceneClip(state), reduceH3Presence(state, { type: "finished", cycle: state.cycle, now: 1 }).clip);
  assert.equal(nextH3SceneClip({ ...state, clip: "beach-loop" }), undefined);
});
