import test from "node:test";
import assert from "node:assert/strict";
import { createPresenceState, nextPresenceDeadline, reducePresence, SLEEP_AFTER_MS } from "./presence";
const ready = () => reducePresence(createPresenceState(), { type: "availability", enabled: true, now: 0 });
test("two-minute sleep starts only when available and sleep has no expiry", () => {
  const awake = ready();
  assert.equal(nextPresenceDeadline(awake), SLEEP_AFTER_MS);
  assert.equal(reducePresence(awake, { type: "tick", now: SLEEP_AFTER_MS - 1 }), awake);
  const entering = reducePresence(awake, { type: "tick", now: SLEEP_AFTER_MS });
  assert.equal(entering.phase, "entering");
  const sleeping = reducePresence(entering, { type: "finished", cycle: entering.cycle, now: 128_050 });
  assert.equal(sleeping.phase, "sleeping"); assert.equal(nextPresenceDeadline(sleeping), null);
  assert.equal(reducePresence(sleeping, { type: "tick", now: 999_999_999 }), sleeping);
});
test("click wakes, completes getting up, yawns, then returns to neutral", () => {
  let state = reducePresence(ready(), { type: "tick", now: SLEEP_AFTER_MS });
  state = reducePresence(state, { type: "finished", cycle: state.cycle, now: 129_000 });
  state = reducePresence(state, { type: "click", now: 200_000 });
  assert.equal(state.phase, "waking");
  assert.equal(reducePresence(state, { type: "click", now: 200_001 }), state);
  state = reducePresence(state, { type: "finished", cycle: state.cycle, now: 205_050 });
  assert.equal(state.phase, "recovering");
  state = reducePresence(state, { type: "finished", cycle: state.cycle, now: 209_100 });
  assert.equal(state.phase, "awake"); assert.equal(nextPresenceDeadline(state), 329_100);
});
test("click during entry queues wake without teleporting or stale completion", () => {
  let state = reducePresence(ready(), { type: "tick", now: SLEEP_AFTER_MS });
  const cycle = state.cycle;
  state = reducePresence(state, { type: "click", now: 122_000 });
  assert.equal(state.phase, "entering"); assert.equal(state.wakeRequested, true);
  state = reducePresence(state, { type: "finished", cycle, now: 128_050 });
  assert.equal(state.phase, "waking");
  assert.equal(reducePresence(state, { type: "finished", cycle, now: 128_060 }), state);
});
test("dialog, hidden tabs and motion pause postpone sleep without catch-up", () => {
  let state = reducePresence(ready(), { type: "availability", enabled: false, now: 60_000 });
  assert.equal(nextPresenceDeadline(state), null);
  assert.equal(reducePresence(state, { type: "tick", now: 900_000 }), state);
  state = reducePresence(state, { type: "availability", enabled: true, now: 900_000 });
  assert.equal(nextPresenceDeadline(state), 1_020_000);
  state = reducePresence(state, { type: "tick", now: 1_020_000 });
  state = reducePresence(state, { type: "finished", cycle: state.cycle, now: 1_029_000 });
  state = reducePresence(state, { type: "availability", enabled: false, now: 1_030_000 });
  state = reducePresence(state, { type: "availability", enabled: true, now: 2_000_000 });
  assert.equal(state.phase, "sleeping");
});
test("reduced-motion wake and failed artwork always restore a usable launcher", () => {
  let state = reducePresence(ready(), { type: "tick", now: SLEEP_AFTER_MS });
  state = reducePresence(state, { type: "finished", cycle: state.cycle, now: 129_000 });
  state = reducePresence(state, { type: "availability", enabled: false, now: 130_000 });
  assert.equal(reducePresence(state, { type: "click", now: 140_000 }).phase, "awake");
  assert.equal(reducePresence(state, { type: "failed", now: 140_000 }).phase, "awake");
});
