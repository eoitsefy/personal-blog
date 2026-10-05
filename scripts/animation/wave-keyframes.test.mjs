import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const folder = resolve(root, "docs/assistant/wave-keyframes-v7");
const json = async path => JSON.parse(await readFile(resolve(folder, path), "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const files = ["00-neutral.png", "01-prep.png", "02-middle.png", "03-peak.png"];
const pixels = async path => sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

test("wave candidates retain transparent 768px canvases and the original neutral", async () => {
  const baseline = await pixels(resolve(root, "docs/assistant/art-pilot-v6/reference/neutral-clean.png"));
  for (const file of files) {
    const { data, info } = await pixels(resolve(folder, "keys", file));
    assert.equal(info.width, 768);
    assert.equal(info.height, 768);
    assert.equal(info.channels, 4);
    // Independent frame-border check, not the authoring script's alpha bounds.
    for (let n = 0; n < 768; n++) {
      for (const p of [n * 4 + 3, (767 * 768 + n) * 4 + 3, n * 768 * 4 + 3, (n * 768 + 767) * 4 + 3]) {
        assert.equal(data[p], 0);
      }
    }
    if (file === files[0]) assert.deepEqual(data, baseline.data);
  }
});

test("wave keyframe face, torso centre and feet remain original pixels", async () => {
  const { data: original } = await pixels(resolve(folder, "reference/neutral-clean.png"));
  for (const file of files.slice(1)) {
    const { data } = await pixels(resolve(folder, "keys", file));
    for (let y = 0; y < 768; y++) for (let x = 0; x < 768; x++) {
      const p = (y * 768 + x) * 4;
      const protectedHead = y < 400 && original[p + 3] >= 8;
      const protectedBody = x >= 336 && y >= 400 && y < 527;
      if (protectedHead || protectedBody || y >= 527) {
        assert.deepEqual(data.subarray(p, p + 4), original.subarray(p, p + 4), `${file} at ${x},${y}`);
      }
    }
  }
});

test("wave technical provenance is bound to the actual generated and baked files", async () => {
  const report = await json("review/automatic.json");
  const neutral = (await pixels(resolve(folder, "keys/00-neutral.png"))).data;
  assert.equal(hash(neutral), report.neutralRgbaSha256);
  const hashes = [hash(neutral)];
  for (const [i, pose] of report.poses.entries()) {
    const frame = (await pixels(resolve(folder, "keys", files[i + 1]))).data;
    assert.equal(hash(frame), pose.rgbaSha256);
    hashes.push(hash(frame));
    assert.equal(hash(await readFile(resolve(folder, "generated", pose.name + ".png"))), pose.sourceSha256);
    assert.equal(pose.footChanges, 0);
    assert.equal(pose.outsideChanges, 0);
    assert.equal(pose.safeMargins, true);
    assert.equal(pose.headSkinOverlapBeforeProtection, 0);
    assert.ok(pose.skinTranslucentRatio < .05);
  }
  assert.equal(hash(Buffer.from(hashes.join(""))), report.artScopeSha256);
  assert.equal(report.interpolationRun, false);
  assert.equal(report.newGeneratedPoses, 3);
});

test("wave art rejection cannot be promoted by technical success or old acceptance", async () => {
  const automatic = await json("review/automatic.json");
  const visual = await json("review/visual.json");
  assert.equal(visual.artScopeSha256, automatic.artScopeSha256);
  assert.equal(visual.status, "REJECTED");
  assert.equal(automatic.releaseAllowed, false);
  assert.equal(visual.releaseAllowed, false);
  assert.equal(visual.interpolationAllowed, false);
  assert.ok(visual.checks.some(check => check.status === "REJECTED"));
  assert.equal(visual.productionChanged, false);
});

test("wave image prompts preserve all five calls and separate discarded candidates", async () => {
  const prompts = await json("prompts.json");
  assert.equal(prompts.toolCalls, 5);
  assert.equal(prompts.entries.length, 5);
  assert.equal(prompts.entries.filter(entry => entry.decision === "SELECTED_FOR_BAKE").length, 3);
  assert.equal(prompts.deepSeekCallsThisTurn, 0);
  assert.equal(prompts.extraImageApi, false);
  for (const entry of prompts.entries) {
    assert.ok(entry.prompt.length > 1000);
    await readFile(resolve(folder, entry.output));
    for (const file of entry.referencedImages) await readFile(resolve(folder, file));
  }
});
