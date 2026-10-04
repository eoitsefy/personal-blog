import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { CHARACTER_ACTIONS, CHARACTER_ATLAS, CHARACTER_STAGE, CHARACTER_POSES, characterPose, characterSample } from "./character";

test("actions include six registered poses and eased transitions without translation", () => {
  for (const action of Object.keys(CHARACTER_ACTIONS) as (keyof typeof CHARACTER_ACTIONS)[]) {
    const config = CHARACTER_ACTIONS[action];
    const offsets = action === "idle" ? [0, .86, .9, .93, .96, .98] : [0, .14, .28, .44, .62, .8];
    assert.equal(new Set(offsets.map(offset => characterSample(action, offset * config.duration + 1).to)).size, 6);
    const start = offsets[1] * config.duration;
    const duration = Math.min(CHARACTER_STAGE.blendMs, (offsets[1] - offsets[0]) * config.duration);
    const middle = characterSample(action, start + duration / 2);
    assert.ok(Math.abs(middle.mix - .5) < .00001);
    assert.ok(characterSample(action, start + duration / 4).mix < middle.mix);
    const neutral = config.loop ? config.row * 6 : 0;
    assert.deepEqual(characterSample(action, config.duration), { from: neutral, to: neutral, mix: 1 });
  }
});

test("36 source crops exclude neighbouring rows and have fixed boot anchors and full stage margins", async () => {
  const { data, info } = await sharp(`public${CHARACTER_ATLAS.src}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, CHARACTER_ATLAS.width);
  assert.equal(info.height, CHARACTER_ATLAS.height);
  for (let index = 0; index < 36; index++) {
    const pose = characterPose(index), raw = CHARACTER_POSES[Math.floor(index / 6)][index % 6];
    assert.ok(Math.abs(pose.left + raw[4] - pose.x - CHARACTER_STAGE.centre) < .00001);
    assert.equal(pose.top + pose.height, CHARACTER_STAGE.baseline);
    assert.ok(pose.top >= 8 && pose.left >= 8 && pose.left + pose.width <= CHARACTER_STAGE.size - 8);
    assert.ok(pose.y >= 0 && pose.y + pose.height <= info.height);
    for (const y of [pose.y - 1, pose.y + pose.height]) {
      if (y < 0 || y >= info.height) continue;
      for (let x = pose.x; x < pose.x + pose.width; x++) assert.ok(data[(y * info.width + x) * 4 + 3] <= 100, `pose ${index} spills into adjacent row`);
    }
  }
});
