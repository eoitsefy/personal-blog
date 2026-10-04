import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_ACTIONS, CHARACTER_ATLAS, characterKeyframes } from "./character";

test("six registered actions each include six poses and return to arms-down idle", () => {
  assert.equal(Object.keys(CHARACTER_ACTIONS).length, 6);
  for (const action of Object.keys(CHARACTER_ACTIONS) as (keyof typeof CHARACTER_ACTIONS)[]) {
    const frames = characterKeyframes(action);
    assert.equal(frames.length, 7);
    assert.equal(new Set(frames.slice(0, 6).map(frame => frame.left)).size, 6);
    assert.deepEqual(frames.at(-1), { left: "0%", top: "0%", offset: 1, easing: "steps(1, end)" });
    assert.ok(frames.every((frame, index) => index === 0 || frame.offset > frames[index - 1].offset));
    assert.ok(CHARACTER_ACTIONS[action].row < CHARACTER_ATLAS.rows);
  }
  assert.equal(CHARACTER_ATLAS.width / CHARACTER_ATLAS.columns, CHARACTER_ATLAS.height / CHARACTER_ATLAS.rows);
});
