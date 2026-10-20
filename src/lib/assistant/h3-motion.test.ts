import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { H3_CLIPS, H3_MOTION, H3_MOBILE_MOTION, H3_BASIC_CLIPS, H3MotionClock, h3Action, validH3Motion, type H3Manifest } from "./h3-motion";

const basics = ["idle-blink", "wave", "nod", "thanks", "thinking", "cheer", "yawn"];
const retired = ["h3-v2", "h3-v3", "h3-mobile-v1"];

test("H3 publishes only the seven current basic actions; old scene releases have no runtime files", () => {
  assert.deepEqual([...H3_CLIPS], basics); assert.deepEqual([...H3_BASIC_CLIPS], basics);
  assert.equal(h3Action("bow"), "thanks"); assert.equal(h3Action("idle"), "idle-blink");
  for (const release of [H3_MOTION, H3_MOBILE_MOTION]) {
    assert(validH3Motion(release)); assert.deepEqual(Object.keys(release.clips), basics);
    assert.deepEqual(Object.keys(release.stills), basics);
    assert.equal(release.review.aiArtReview, false);
    assert.equal(Object.keys(release.assets).length, 112);
    for (const name of H3_CLIPS) {
      const c = release.clips[name];
      assert.equal(c.frames, 124); assert.equal(c.loop, name === "idle-blink");
      assert.equal(c.alphaExact, false); assert.equal(c.rgbLossless, false);
      assert.equal(c.scaledAlphaPreserved, true);
    }
  }
  for (const directory of retired) assert.equal(existsSync(`public/assistant/${directory}`), false, directory);
  for (const directory of [...retired, "h3-v4", "h3-mobile-v2"]) assert.equal(existsSync(`src/lib/assistant/releases/${directory}/manifest.json`), false, directory);
});

test("both sizes have complete real WebP files, exact release hashes, expected geometry and alpha", async () => {
  for (const release of [H3_MOTION, H3_MOBILE_MOTION]) {
    const paths = new Set<string>();
    for (const asset of [...Object.values(release.assets), ...Object.values(release.stills)]) {
      assert(!paths.has(asset.src)); paths.add(asset.src);
      const bytes = readFileSync(`public${asset.src}`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.src);
      const metadata = await sharp(bytes).metadata();
      const atlas = "width" in asset;
      assert.equal(metadata.format, "webp"); assert.equal(metadata.hasAlpha, true);
      assert.equal(metadata.pages ?? 1, 1);
      assert.equal(metadata.width, release.width * (atlas ? 4 : 1));
      assert.equal(metadata.height, release.height * (atlas ? 2 : 1));
    }
    const directory = release.width === 320 ? "h3-mobile-v2" : "h3-v4";
    assert.equal(readdirSync(`public/assistant/${directory}`).length, paths.size);
    const manifestDirectory = release.width === 320 ? "h3-mobile-v3" : "h3-v5";
    assert.deepEqual(JSON.parse(readFileSync(`public/assistant/${manifestDirectory}/manifest.json`, "utf8")), release);
  }
});

test("malformed, stale, scene-injected, mixed and unreferenced resources fail closed", () => {
  for (const release of [H3_MOTION, H3_MOBILE_MOTION]) {
    for (const mutate of [
      (m: H3Manifest) => { m.version = "h3-motion-v4"; },
      (m: H3Manifest) => { m.review.userAuthorizedRelease = false; },
      (m: H3Manifest) => { m.candidate = { localOnly: true }; },
      (m: H3Manifest) => { m.clips.wave.alphaExact = true; },
      (m: H3Manifest) => { m.clips.wave.durations[0]++; },
      (m: H3Manifest) => { m.clips.wave.pages[1] = m.clips.wave.pages[0]; },
      (m: H3Manifest) => { m.assets[m.clips.wave.pages[0]].src = "/assistant/h3-v2/bed-pull-000.webp"; },
      (m: H3Manifest) => { m.stills.wave.src = "/assistant/h3-v4/../wave.webp"; },
      (m: H3Manifest) => { m.assets[m.clips.wave.pages[0]].src = "https://example.com/wave.webp"; },
      (m: H3Manifest) => { m.encoding!.alphaQuality = 90; },
      (m: H3Manifest) => { m.release!.includedClips.reverse(); },
      (m: H3Manifest) => { m.release!.sceneClipsRemoved = false; },
      (m: H3Manifest) => { m.assets.unreferenced = { ...m.assets[m.clips.wave.pages[0]] }; },
      (m: H3Manifest) => { (m.clips as Record<string, unknown>)["bed-pull"] = m.clips.wave; },
    ]) { const changed = structuredClone(release); mutate(changed); assert.equal(validH3Motion(changed), false); }
  }
  for (const value of [null, undefined, {}, {version:"h3-motion-v5"}]) assert.equal(validH3Motion(value as H3Manifest), false);
});

test("idle finishes its real cycle before a requested gesture; gestures hold genuine final frame and complete once", () => {
  const clock = new H3MotionClock(H3_MOTION), done: number[] = [];
  clock.sample(0, id => done.push(id)); clock.request({clip:"wave", playId:1});
  assert.equal(clock.sample(100, id => done.push(id)).clip, "idle-blink");
  const length = H3_MOTION.clips["idle-blink"].durationMs;
  assert.equal(clock.sample(length, id => done.push(id)).clip, "wave");
  assert.equal(clock.sample(length + H3_MOTION.clips.wave.durationMs + 1, id => done.push(id)).frame, 123);
  clock.sample(length * 3, id => done.push(id)); assert.deepEqual(done, [1]);
  clock.request({clip:"idle-blink", playId:2});
  assert.equal(clock.sample(length * 3 + 1, id => done.push(id)).clip, "idle-blink");
});

test("pausing retains phase and a one-shot idle finishes once without fetching removed scenes", () => {
  const clock = new H3MotionClock(H3_MOTION), done: number[] = [];
  clock.request({clip:"idle-blink", playId:3, once:true});
  clock.sample(0, id => done.push(id)); const first = clock.sample(100, id => done.push(id));
  clock.delay(3000); assert.equal(clock.sample(3100, id => done.push(id)).frame, first.frame);
  const end = H3_MOTION.clips["idle-blink"].durationMs + 3000;
  const last = clock.sample(end + 1, id => done.push(id));
  assert.equal(last.frame, 123); assert.equal(last.nextAsset, undefined);
  clock.sample(end + 100, id => done.push(id)); assert.deepEqual(done, [3]);
});
