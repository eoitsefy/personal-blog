import { test } from "node:test";
import assert from "node:assert/strict";
import mobile from "./releases/h3-mobile-v1/manifest.json";
import { H3_CLIPS, H3_MOTION, H3MotionClock, validH3CandidateRuntime, validH3Motion, type H3Manifest, type H3Sample } from "./h3-motion";
import { H3PageCache, H3Player, loadH3Image, type H3PlayerRequest } from "./h3-player";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness() {
  const manifest = structuredClone(H3_MOTION);
  manifest.width = manifest.height = 2;
  manifest.assets = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map(key => [key, { src: key, sha256: key, width: 8, height: 4, alpha: true }]));
  for (const clip of H3_CLIPS) manifest.clips[clip] = { ...manifest.clips[clip], frames: 24, durations: Array(24).fill(40), durationMs: 960, pages: ["a", "b", "c"], loop: false };
  manifest.clips.nod.pages = ["d", "e", "f"];
  const loads = new Map<string, ReturnType<typeof deferred<string>>>(), paints: H3Sample[] = [], done: number[] = [];
  const frames = new Map<number, (now: number) => void>();
  let time = 0, nextFrame = 0, failures = 0, maxPending = 0;
  const cache = new H3PageCache<string>(96);
  const player = new H3Player(manifest, cache, {
    now: () => time,
    requestFrame: callback => { const id = ++nextFrame; frames.set(id, callback); maxPending = Math.max(maxPending, frames.size); return id; },
    cancelFrame: id => { frames.delete(id); },
    load: asset => { const d = deferred<string>(); loads.set(asset.src, d); return d.promise; },
    paint: (_, sample) => { paints.push(sample); }, onFinished: id => { done.push(id); }, onFailed: () => { failures++; },
  });
  function advance(now: number) { time = now; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); }
  const request: H3PlayerRequest = { clip: "wave", playId: 1, animate: true, once: true };
  return { manifest, player, cache, loads, paints, done, frames, request, advance,
    setTime: (now: number) => { time = now; }, failures: () => failures, maxPending: () => maxPending };
}

test("mobile runtime is an explicit local candidate and cannot satisfy approved release validation", () => {
  assert(validH3CandidateRuntime(mobile)); assert.equal(validH3Motion(mobile as H3Manifest), false);
  for (const mutate of [
    (m: H3Manifest) => { m.review.userAuthorizedRelease = true; },
    (m: H3Manifest) => { m.clips.wave.alphaExact = true; },
    (m: H3Manifest) => { m.clips.wave.durations[0]++; },
    (m: H3Manifest) => { m.assets[m.clips.wave.pages[0]].src = "/assistant/h3-mobile-v1/../wave.webp"; },
    (m: H3Manifest) => { m.candidate!.localOnly = false; },
  ]) { const m = structuredClone(mobile) as H3Manifest; mutate(m); assert.equal(validH3CandidateRuntime(m), false); }
  assert.equal(validH3CandidateRuntime(null), false);
  assert(validH3Motion(H3_MOTION));
});

test("mobile sample uses manifest geometry and one-shot loops never prefetch a wrapped page", () => {
  const m = mobile as H3Manifest, clock = new H3MotionClock(m);
  clock.request({ clip: "idle-blink", playId: 1, once: true }); clock.sample(0, () => {});
  assert.equal(clock.sample(m.clips["idle-blink"].durations[0], () => {}).x, 320);
  const last = clock.sample(m.clips["idle-blink"].durationMs, () => {});
  assert.equal(last.frame, m.clips["idle-blink"].frames - 1); assert.equal(last.nextAsset, undefined); assert.equal(last.finished, true);
});

test("shared cache deduplicates pending images and never reserves a fourth decoding page", async () => {
  const cache = new H3PageCache<string>(30), values = [deferred<string>(), deferred<string>(), deferred<string>(), deferred<string>()];
  const started: number[] = [];
  const leases = values.map((value, index) => cache.acquire(String(index), 10, () => { started.push(index); return value.promise; }));
  const duplicate = cache.acquire("0", 10, () => { throw new Error("duplicate decoder"); });
  await flush(); assert.deepEqual(started, [0, 1, 2]); assert.equal(cache.size, 3); assert.equal(cache.pixels, 30); assert.equal(cache.queued, 1);
  leases[0].release(); duplicate.release();
  await flush(); assert.equal(started.length, 3, "abort-ignoring load still owns its reservation");
  values[0].resolve("cancelled"); await flush();
  assert.deepEqual(started, [0, 1, 2, 3]); assert.equal(cache.size, 3); assert.equal(cache.pixels, 30);
  values.slice(1).forEach((value, index) => value.resolve(String(index + 1))); await flush();
  leases.slice(1).forEach(lease => lease.release());
  assert.equal(await leases[1].promise, "1");
});

test("queued required loads take precedence and releasing a queued lease settles its promise", async () => {
  const cache = new H3PageCache<string>(10, 1), held = deferred<string>(), starts: string[] = [];
  const first = cache.acquire("held", 10, () => held.promise);
  const speculative = cache.acquire("later", 10, async () => { starts.push("later"); return "later"; });
  const required = cache.acquire("required", 10, async () => { starts.push("required"); return "required"; }, true);
  const cancelled = cache.acquire("cancelled", 10, async () => "cancelled");
  cancelled.release(); await assert.rejects(cancelled.promise, /cancelled/);
  held.resolve("held"); await flush(); first.release(); await flush();
  assert.deepEqual(starts, ["required"]); assert.equal(await required.promise, "required");
  required.release(); await flush(); assert.deepEqual(starts, ["required", "later"]); speculative.release();
});

test("player waits for required images, draws each frame once and owns only one animation callback", async () => {
  const h = harness(); h.player.update(h.request); await flush();
  assert.equal(h.frames.size, 0); assert.equal(h.paints.length, 0); assert.equal(h.loads.size, 3);
  h.loads.forEach((load, key) => load.resolve(key)); await flush(); h.advance(100);
  assert.equal(h.paints.length, 1); assert.equal(h.paints[0].frame, 0);
  for (let now = 110; now < 140; now += 10) h.advance(now);
  assert.equal(h.paints.length, 1);
  h.advance(140); assert.equal(h.paints.length, 2); assert.equal(h.paints[1].frame, 1);
  h.player.update(h.request); h.player.update(h.request); assert.equal(h.frames.size, 1); assert.equal(h.maxPending(), 1);
  h.player.dispose(); assert.equal(h.frames.size, 0);
});

test("late image completion cannot resume hidden players and pause retains the native phase", async () => {
  const h = harness(); h.player.update(h.request); await flush();
  h.setTime(100); h.player.update({ ...h.request, animate: false });
  h.loads.get("a")!.resolve("a"); await flush();
  assert.equal(h.frames.size, 0); assert.equal(h.paints.length, 0);
  h.setTime(1100); h.player.update(h.request);
  assert.equal(h.paints[0].frame, 0);
  h.advance(1140); assert.equal(h.paints.at(-1)!.frame, 1);
  h.setTime(1150); h.player.update({ ...h.request, animate: false });
  h.setTime(2150); h.player.update(h.request); assert.equal(h.paints.at(-1)!.frame, 1);
  h.player.dispose(); h.loads.forEach((load, key) => load.resolve(key)); await flush(); assert.equal(h.frames.size, 0);
});

test("speculative failure waits until required, then fails once without clearing a valid frame", async () => {
  const h = harness(); h.player.update(h.request); await flush();
  h.loads.get("a")!.resolve("a"); h.loads.get("b")!.reject(new Error("future page unavailable")); h.loads.get("c")!.resolve("c"); await flush();
  h.advance(0); h.advance(280); assert.equal(h.failures(), 0); assert(h.paints.length > 0);
  const painted = h.paints.length; h.advance(320);
  assert.equal(h.paints.length, painted); assert.equal(h.failures(), 1); assert.deepEqual(h.done, [1]); assert.equal(h.frames.size, 0);
  h.player.update(h.request); h.advance(1000); assert.equal(h.failures(), 1); assert.deepEqual(h.done, [1]); h.player.dispose();
});

test("completed one-shots paint the genuine final frame, notify once and stop scheduling", async () => {
  const h = harness(); h.player.update(h.request); await flush(); h.loads.forEach((load, key) => load.resolve(key)); await flush();
  h.advance(0); h.advance(960);
  assert.equal(h.paints.at(-1)!.frame, 23); assert.deepEqual(h.done, [1]); assert.equal(h.frames.size, 0);
  h.setTime(1000); h.player.update(h.request); assert.deepEqual(h.done, [1]); assert.equal(h.frames.size, 0); h.player.dispose();
});

test("transition first-page prefetch waits until the final page and stays within three pages", async () => {
  const h = harness(); h.player.update({ ...h.request, nextClip: "nod" }); await flush(); h.loads.forEach((load, key) => load.resolve(key)); await flush();
  h.advance(0); assert.equal(h.loads.has("d"), false);
  h.advance(640); await flush(); assert.equal(h.loads.has("d"), true); assert(h.cache.size <= 3); assert(h.cache.pixels <= 96);
  h.loads.get("d")!.resolve("d"); await flush();
  h.setTime(650); h.player.update({ clip: "nod", playId: 2, animate: true, once: true });
  h.advance(960); assert.equal(h.paints.at(-1)!.clip, "nod"); assert.equal(h.paints.at(-1)!.frame, 0); assert.deepEqual(h.done, [1]); h.player.dispose();
});

test("image loader awaits decoding and rejects failed or cancelled decoding", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window"), instances: MockImage[] = [];
  class MockImage {
    naturalWidth = 8; naturalHeight = 4; src = "";
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    decoded = deferred<void>(); decode = () => this.decoded.promise;
    constructor() { instances.push(this); }
  }
  Object.defineProperty(globalThis, "window", { value: { Image: MockImage }, configurable: true });
  try {
    const asset = { src: "mock.webp", width: 8, height: 4, sha256: "", alpha: true };
    let ready = false;
    const first = loadH3Image(asset, new AbortController().signal).then(image => { ready = true; return image; });
    instances[0].onload!(); await flush(); assert.equal(ready, false);
    instances[0].decoded.resolve(); await first; assert.equal(ready, true);
    const failed = loadH3Image(asset, new AbortController().signal); instances[1].onload!(); instances[1].decoded.reject(new Error("decode failed"));
    await assert.rejects(failed, /decode unavailable/); assert.equal(instances[1].src, "");
    const abort = new AbortController(), cancelled = loadH3Image(asset, abort.signal); instances[2].onload!(); abort.abort();
    await assert.rejects(cancelled, /cancelled/); instances[2].decoded.resolve(); await flush(); assert.equal(instances[2].src, "");
    const older = loadH3Image(asset, new AbortController().signal);
    Object.defineProperty(instances[3], "decode", { value: undefined }); instances[3].onload!(); await older;
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});


test("resource changes wait for a natural boundary, retain completed one-shots and isolate cache identities", async () => {
  const h = harness(); h.player.update(h.request); await flush();
  h.loads.forEach((load, key) => load.resolve(key)); await flush(); h.advance(0); h.advance(320);
  const next = structuredClone(h.manifest); next.version = "other-size";
  for (const asset of Object.values(next.assets)) { asset.src = `small-${asset.src}`; asset.sha256 = `small-${asset.sha256}`; }
  assert(h.player.requestManifest(next)); h.setTime(400); h.player.update(h.request); await flush();
  assert.equal([...h.loads.keys()].some(key => key.startsWith("small-")), false, "no mid-motion switch/reload");
  h.advance(960); await flush(); assert(h.loads.has("small-c")); assert.deepEqual(h.done, [1]);
  h.loads.forEach((load, key) => load.resolve(key)); await flush(); h.advance(1000);
  assert.equal(h.paints.at(-1)!.frame, 23, "finished action must not restart");
  assert.deepEqual(h.done, [1]); assert.equal(h.frames.size, 0); assert(h.cache.size <= 3); assert(h.cache.pixels <= 96);
  h.player.dispose();
});

test("loop resources change only at wrap; cancelling a pending resize leaves playback intact", async () => {
  const h = harness(); h.manifest.clips.wave.loop = true;
  h.player.update({ ...h.request, once: false }); await flush(); h.loads.forEach((load, key) => load.resolve(key)); await flush(); h.advance(0);
  const next = structuredClone(h.manifest); next.version = "small"; for (const a of Object.values(next.assets)) a.src = `small-${a.src}`;
  const bad = structuredClone(next); bad.clips.wave.frames++; assert.equal(h.player.requestManifest(bad), false);
  assert(h.player.requestManifest(next)); assert(h.player.requestManifest(h.manifest)); h.advance(960); await flush();
  assert.equal(h.loads.has("small-a"), false);
  assert(h.player.requestManifest(next)); h.advance(1000); await flush(); assert.equal(h.loads.has("small-a"), false);
  h.advance(1920); await flush(); assert(h.loads.has("small-a"));
  h.loads.forEach((load, key) => load.resolve(key)); await flush(); h.advance(2000); assert.equal(h.paints.at(-1)!.frame, 0);
  assert.deepEqual(h.done, []); h.player.dispose();
});
