import { test } from "node:test";
import assert from "node:assert/strict";
import { NATURAL_MOTION, NaturalMotionClock, NaturalResourceCache, naturalFrameIndex, validNaturalMotion, type NaturalMotionManifest } from "./natural-motion";

function fixture(): NaturalMotionManifest {
  const hash = "a".repeat(64), middle = "b".repeat(64);
  const frame = (x: number, rgbaSha256 = hash) => ({ asset: "page", x, y: 0, durationMs: 100, rgbaSha256 });
  return { version: "test-only", width: 64, height: 64, anchorRgbaSha256: hash,
    still: { src: "/assistant/test-only-still.webp", sha256: hash },
    review: { art: "PASS", technical: "PASS", transitions: "PASS", report: "test-fixture" },
    assets: { page: { src: "/assistant/test-only.webp", width: 192, height: 64, sha256: hash, alpha: true } },
    clips: { idle: { frames: [frame(0), frame(64, middle), frame(0)] }, wave: { frames: [frame(0), frame(128, middle), frame(0)] } } };
}
test("production motion is disabled or structurally valid; file scope is checked by asset-validator tests", () => {
  if (NATURAL_MOTION !== null) assert.equal(validNaturalMotion(NATURAL_MOTION), true);
  assert.equal(validNaturalMotion(null), false);
  assert.equal(validNaturalMotion(fixture()), true);
});
test("gate rejects RGB, mismatched endpoints, off-canvas crops and external sources", () => {
  const rgb = fixture(); (rgb.assets.page as { alpha: boolean }).alpha = false;
  assert.equal(validNaturalMotion(rgb), false);
  const endpoint = fixture(); endpoint.clips.wave!.frames.at(-1)!.rgbaSha256 = "c".repeat(64);
  assert.equal(validNaturalMotion(endpoint), false);
  const crop = fixture(); crop.clips.wave!.frames[1].x = 160;
  assert.equal(validNaturalMotion(crop), false);
  const external = fixture(); external.assets.page.src = "https://example.com/page.webp";
  assert.equal(validNaturalMotion(external), false);
  const traversing = fixture(); traversing.assets.page.src = "/assistant/../unreviewed.webp";
  assert.equal(validNaturalMotion(traversing), false);
});
test("idle completes to common anchor before wave; completed wave returns directly to same anchor", () => {
  const clock = new NaturalMotionClock(fixture()), finished: number[] = [];
  const done = (id: number) => finished.push(id);
  assert.equal(clock.sample(0, done).action, "idle");
  clock.request({ action: "wave", playId: 9, once: true });
  assert.equal(clock.sample(150, done).action, "idle");
  assert.equal(clock.sample(250, done).frame, 2);
  assert.equal(clock.sample(300, done).action, "wave");
  assert.equal(clock.sample(400, done).frame, 1);
  assert.equal(clock.sample(600, done).action, "idle");
  assert.equal(clock.sample(900, done).action, "idle");
  assert.deepEqual(finished, [9]);
});
test("late browser ticks never skip action's anchor or shorten its playback", () => {
  const clock = new NaturalMotionClock(fixture());
  clock.sample(0, () => {}); clock.request({ action: "wave", playId: 2, once: true });
  assert.equal(clock.sample(2000, () => {}).frame, 0);
  assert.equal(clock.sample(2100, () => {}).frame, 1);
});
test("newly visible player can begin on shared anchor without an unnecessary idle-cycle wait", () => {
  const clock = new NaturalMotionClock(fixture());
  clock.request({ action: "wave", playId: 4, once: true });
  const first = clock.sample(500, () => {});
  assert.equal(first.action, "wave");
  assert.equal(first.frame, 0);
});
test("unsupported action settles once without legacy assets", () => {
  const clock = new NaturalMotionClock(fixture()), finished: number[] = [];
  clock.request({ action: "bow", playId: 3, once: true });
  for (const time of [0, 100, 300, 1000]) assert.equal(clock.sample(time, id => finished.push(id)).action, "idle");
  assert.deepEqual(finished, [3]);
});
test("reset for hidden or reduced-motion cancels pending/current requests once", () => {
  const clock = new NaturalMotionClock(fixture()), finished: number[] = [];
  clock.request({ action: "wave", playId: 1, once: true });
  clock.sample(0, id => finished.push(id)); clock.reset(id => finished.push(id)); clock.reset(id => finished.push(id));
  assert.deepEqual(finished, [1]);
  assert.equal(clock.sample(400, id => finished.push(id)).action, "idle");
});
test("looping request and replacement remain on whole-clip boundaries", () => {
  const clock = new NaturalMotionClock(fixture()), finished: number[] = [];
  const done = (id: number) => finished.push(id);
  clock.sample(0, done); clock.request({ action: "wave", playId: 1, once: false });
  clock.sample(300, done);
  assert.equal(clock.sample(600, done).action, "wave");
  clock.request({ action: "idle", playId: 2, once: true });
  assert.equal(clock.sample(700, done).action, "wave");
  assert.equal(clock.sample(900, done).action, "idle");
  assert.deepEqual(finished, []);
});
test("frame boundaries are deterministic and never blend drawings", () => {
  const clip = fixture().clips.idle;
  assert.equal(naturalFrameIndex(clip, 0), 0);
  assert.equal(naturalFrameIndex(clip, 99.999), 0);
  assert.equal(naturalFrameIndex(clip, 100), 1);
  assert.equal(naturalFrameIndex(clip, 300), 2);
});

test("malformed generated manifests fail closed without throwing", () => {
  for (const value of [undefined, {}, { ...fixture(), assets: undefined }, { ...fixture(), clips: { idle: {} } },
    { ...fixture(), clips: { idle: { frames: [null, null] } } }, { ...fixture(), assets: { page: null } },
    { ...fixture(), assets: {}, clips: { idle: { frames: fixture().clips.idle.frames.map(frame => ({ ...frame, asset: "toString" })) } } },
    { ...fixture(), still: { src: "/assistant/../bad.webp", sha256: "a".repeat(64) } }]) {
    assert.equal(validNaturalMotion(value), false);
  }
});

function breathingFixture() {
  const manifest = fixture(), middle = manifest.clips.idle.frames[1];
  manifest.clips.idle.frames = Array.from({ length: 64 }, (_, index) => ({ ...middle, durationMs: 62.5,
    rgbaSha256: index === 0 || index === 63 ? manifest.anchorRgbaSha256 : middle.rgbaSha256 }));
  return manifest;
}
test("four-second breathing returns along existing frames within 360ms, then starts gesture at anchor", () => {
  for (const phase of [125, 700, 1950, 2300, 3800]) {
    const manifest = breathingFixture(), clock = new NaturalMotionClock(manifest), done = () => {};
    clock.sample(0, done);
    const before = clock.sample(phase, done);
    clock.request({ action: "wave", playId: 5, once: true });
    assert.equal(clock.sample(phase, done).frame, before.frame, "first return drawing must not jump");
    const seen = [before.frame];
    let gestureStarted = false;
    for (let ms = 16; ms <= 352; ms += 16) {
      const sample = clock.sample(phase + ms, done);
      if (sample.action === "idle") seen.push(sample.frame);
      else if (!gestureStarted) { assert.equal(sample.frame, 0); gestureStarted = true; }
    }
    const end = clock.sample(phase + 360, done);
    if (end.action === "idle") assert.ok(end.frame === 0 || end.frame === 63);
    const started = clock.sample(phase + 376, done);
    assert.equal(started.action, "wave");
    if (!gestureStarted && end.action === "idle") assert.equal(started.frame, 0);
    const direction = before.frame < 63 - before.frame ? -1 : 1;
    assert.ok(seen.every((frame, i) => i === 0 || (frame - seen[i - 1]) * direction >= 0), "return must be monotonic, no frame oscillation");
  }
});

test("a cancelled idle return settles at anchor without starting superseded wave", () => {
  const clock = new NaturalMotionClock(breathingFixture()), done = () => {};
  clock.sample(0, done); clock.sample(1800, done);
  clock.request({ action: "wave", playId: 2, once: true }); clock.sample(1800, done);
  clock.request({ action: "idle", playId: 3, once: true });
  assert.equal(clock.sample(2160, done).action, "idle");
  assert.equal(clock.sample(2180, done).action, "idle");
});

test("resource-loading delay does not fast-forward a current gesture", () => {
  const clock = new NaturalMotionClock(fixture()), done = () => {};
  clock.request({ action: "wave", playId: 1, once: true }); clock.sample(0, done);
  assert.equal(clock.sample(100, done).frame, 1);
  clock.delay(5000);
  assert.equal(clock.sample(5100, done).frame, 1);
});

test("shared cache deduplicates pending loads and reuses a decoded page across visible instances", async () => {
  const cache = new NaturalResourceCache<object>(100), image = {}, calls: string[] = [];
  const load = async () => { calls.push("decode"); return image; };
  const launcher = cache.acquire("same-sha", 60, load), dialog = cache.acquire("same-sha", 60, load);
  assert.equal(await launcher.promise, await dialog.promise);
  launcher.release(); launcher.release(); dialog.release();
  const visibleAgain = cache.acquire("same-sha", 60, load);
  assert.equal(await visibleAgain.promise, image);
  assert.deepEqual(calls, ["decode"]);
  assert.equal(cache.pixels, 60);
  visibleAgain.release();
});

test("cache evicts only unused settled pages and never exceeds decoded budget", async () => {
  const cache = new NaturalResourceCache<string>(100);
  const a = cache.acquire("a", 60, async () => "a"); await a.promise;
  assert.throws(() => cache.acquire("b", 60, async () => "b"), /budget/);
  a.release();
  const b = cache.acquire("b", 60, async () => "b"); await b.promise;
  assert.equal(cache.size, 1); assert.equal(cache.pixels, 60); b.release();
  const broken = cache.acquire("bad", 60, async () => { throw new Error("missing"); });
  await assert.rejects(broken.promise, /missing/); broken.release();
  const retry = cache.acquire("bad", 60, async () => "fixed");
  assert.equal(await retry.promise, "fixed"); retry.release();
});

test("long full-quality libraries may exceed live cache size while paging stays bounded", async () => {
  const manifest = fixture();
  manifest.assets = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i === 0 ? "page" : `page${i}`,
    { src: `/assistant/page-${i}.webp`, width: 1920, height: 1920, sha256: "a".repeat(64), alpha: true as const }]));
  assert.equal(validNaturalMotion(manifest), true, "44M-pixel library is not rejected for a 24M live-cache budget");
  const cache = new NaturalResourceCache<number>(), pagePixels = 1920 * 1920;
  let previous: { release: () => void } | null = null;
  for (let i = 0; i < 12; i++) {
    const current = cache.acquire(`page-${i}`, pagePixels, async () => i);
    assert.equal(await current.promise, i);
    previous?.release(); previous = current;
    assert.ok(cache.pixels <= 24 * 1024 * 1024);
  }
  previous?.release();
});

test("a pending unused decode is not evicted and duplicated during a fast handoff", async () => {
  const cache = new NaturalResourceCache<string>(100);
  let resolve!: (value: string) => void;
  const pending = cache.acquire("a", 60, () => new Promise<string>(done => { resolve = done; }));
  await Promise.resolve(); pending.release();
  assert.throws(() => cache.acquire("b", 60, async () => "b"), /budget/);
  const settling = cache.settlePending(); resolve("a"); await settling;
  const next = cache.acquire("b", 60, async () => "b");
  assert.equal(await next.promise, "b"); next.release();
});
