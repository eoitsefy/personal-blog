import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { CHARACTER_ACTIONS, CHARACTER_SHEETS, CHARACTER_STAGE, CHARACTER_POSES, CHARACTER_FRAME_COUNT, characterOffsets, characterPose, characterSample, type CharacterAction } from "./character";

test("yawn is an explicit twelve-pose one-shot action returning to neutral", () => {
  assert.equal(CHARACTER_ACTIONS.yawn.loop, false);
  assert.equal(CHARACTER_ACTIONS.yawn.label, "打哈欠");
  assert.equal(CHARACTER_POSES[CHARACTER_ACTIONS.yawn.row].length, 12);
  assert.deepEqual(characterSample("yawn", CHARACTER_ACTIONS.yawn.duration + 100), { from: 0, to: 0, mix: 1 });
});

test("all seven actions use twelve actual registered poses and short eased transitions", () => {
  for (const action of Object.keys(CHARACTER_ACTIONS) as CharacterAction[]) {
    const config = CHARACTER_ACTIONS[action], offsets = characterOffsets(action);
    assert.equal(new Set(offsets.slice(0, 12).map(offset => characterSample(action, offset * config.duration + 1).to)).size, 12);
    for (let step = 1; step < offsets.length; step++) {
      const start = offsets[step] * config.duration;
      const duration = Math.min(CHARACTER_STAGE.blendMs, ((offsets[step + 1] ?? 1) - offsets[step]) * config.duration);
      const middle = characterSample(action, start + duration / 2);
      assert.ok(Math.abs(middle.mix - .5) < .00001);
      assert.ok(characterSample(action, start + duration / 4).mix < middle.mix);
    }
    const neutral = config.loop ? config.row * 12 : 0;
    assert.deepEqual(characterSample(action, config.duration), { from: neutral, to: neutral, mix: 1 });
  }
});

test("84 genuine-alpha source crops exclude adjacent rows and keep full boot/hat margins", async () => {
  for (const action of Object.keys(CHARACTER_ACTIONS) as CharacterAction[]) {
    const sheet = CHARACTER_SHEETS[action], row = CHARACTER_ACTIONS[action].row;
    const metadata = await sharp(`public${sheet.src}`).metadata();
    assert.equal(metadata.hasAlpha, true);
    const { data, info } = await sharp(`public${sheet.src}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, sheet.width); assert.equal(info.height, sheet.height);
    assert.equal(CHARACTER_POSES[row].length, CHARACTER_FRAME_COUNT);
    const fingerprints = new Set<string>();
    for (let frame = 0; frame < CHARACTER_FRAME_COUNT; frame++) {
      const pose = characterPose(row * CHARACTER_FRAME_COUNT + frame), raw = CHARACTER_POSES[row][frame];
      assert.ok(Math.abs(pose.left + (raw[4] - pose.x) * sheet.scale - CHARACTER_STAGE.centre) < .00001);
      assert.ok(Math.abs(pose.top + pose.drawHeight - CHARACTER_STAGE.baseline) < .00001);
      assert.ok(pose.top >= 8 && pose.left >= 8 && pose.left + pose.drawWidth <= CHARACTER_STAGE.size - 8);
      assert.ok(pose.y >= 0 && pose.y + pose.height <= info.height);
      for (const y of [pose.y - 1, pose.y + pose.height]) {
        if (y < 0 || y >= info.height) continue;
        for (let x = pose.x; x < pose.x + pose.width; x++) assert.ok(data[(y * info.width + x) * 4 + 3] <= 100, `${action}/${frame}: adjacent-row bleed`);
      }
      const crop = await sharp(`public${sheet.src}`).extract({left:pose.x,top:pose.y,width:pose.width,height:pose.height}).raw().toBuffer();
      fingerprints.add(crop.toString("base64"));
    }
    assert.equal(fingerprints.size, 12, `${action}: drawings must not be duplicated`);
  }
});
