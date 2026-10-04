import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_MOTION_TEMPLATES, MOTION_AUTHORING_FPS, motionDrawingPlan, type MotionAction } from "./motion";
import { CHARACTER_ACTIONS, characterOffsets } from "./character";

test("portable motion briefs preserve twelve real key poses without binding a skin or rig", () => {
  for (const action of Object.keys(CHARACTER_MOTION_TEMPLATES) as MotionAction[]) {
    const template = CHARACTER_MOTION_TEMPLATES[action], plan = motionDrawingPlan(action);
    assert.equal(plan.keyPoses.length, 12);
    assert.equal(new Set(template.stages).size >= 10, true);
    assert.equal(template.offsets.length, 13);
    assert.equal(template.duration, CHARACTER_ACTIONS[action].duration);
    assert.deepEqual(characterOffsets(action), template.offsets);
    assert.ok(!/assistant\/|\.png|skin|joint/i.test(JSON.stringify(plan)));
    assert.equal(plan.keyPoses[0].offset, 0);
    for (let i = 0; i < plan.keyPoses.length; i++) {
      assert.equal(plan.keyPoses[i].timeMs, plan.keyPoses[i].offset * template.duration);
      if (i) assert.ok(plan.keyPoses[i].offset > plan.keyPoses[i - 1].offset);
    }
    assert.ok(plan.end.offset > plan.keyPoses[11].offset && plan.end.offset < 1);
  }
});

test("15 fps authoring budgets do not relabel twelve existing drawings as new frames", () => {
  assert.equal(MOTION_AUTHORING_FPS, 15);
  const budgets = { idle: 90, wave: 27, nod: 23, thinking: 36, bow: 30, cheer: 27, yawn: 39 };
  for (const action of Object.keys(budgets) as MotionAction[]) {
    const plan = motionDrawingPlan(action);
    assert.equal(plan.fps, 15);
    assert.equal(plan.frameCount, budgets[action]);
    assert.equal(plan.keyPoses.length, 12);
    assert.ok(plan.frameCount > plan.keyPoses.length);
  }
});
