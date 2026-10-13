import type { CharacterAction } from "./character";
import releasedMotion from "./releases/natural-selected-actions-v7/manifest.json";

export type NaturalFrame = { asset: string; x: number; y: number; durationMs: number; rgbaSha256: string };
export type NaturalClip = { frames: readonly NaturalFrame[] };
export type NaturalMotionManifest = {
  version: string;
  width: number;
  height: number;
  anchorRgbaSha256: string;
  still: { src: string; sha256: string };
  review: { art: "PASS"; technical: "PASS"; transitions: "PASS"; report: string };
  assets: Readonly<Record<string, { src: string; width: number; height: number; sha256: string; alpha: true }>>;
  clips: { idle: NaturalClip } & Partial<Record<Exclude<CharacterAction, "idle">, NaturalClip>>;
};
// Candidate preview uses identical pixels/timing without falsely claiming review
// approval. Only validNaturalMotion may enable the production character.
export type NaturalRuntimeManifest = Omit<NaturalMotionManifest, "review">;

// Versioned release: actual pixels, independent art/technical reviews and local
// browser transitions are bound by the release validator. Previous files stay intact.
export const NATURAL_MOTION: NaturalMotionManifest | null = releasedMotion as NaturalMotionManifest;
export const NATURAL_DECODED_PIXEL_LIMIT = 24 * 1024 * 1024;
export const NATURAL_IDLE_RETURN_MS = 360;
const hash = /^[a-f0-9]{64}$/;
const localAsset = /^\/assistant\/[a-zA-Z0-9_./-]+\.(?:png|webp)$/;
const actions = new Set(["idle", "wave", "nod", "thinking", "bow", "cheer", "yawn"]);

/** Structural release gate; this does not replace image/art or pixel-hash verification. */
export function validNaturalMotion(value: unknown): value is NaturalMotionManifest {
  if (!validNaturalRuntime(value)) return false;
  const review = (value as NaturalMotionManifest).review;
  return review?.art === "PASS" && review.technical === "PASS" && review.transitions === "PASS" &&
    typeof review.report === "string" && !!review.report;
}

/** Structural pixel/timing validation only. Never a production approval gate. */
export function validNaturalRuntime(value: unknown): value is NaturalRuntimeManifest {
  // Generated JSON must fail closed, including missing objects/arrays, not throw in React render.
  try {
  const manifest = value as NaturalRuntimeManifest | null;
  if (!manifest || typeof manifest.version !== "string" || !manifest.version || !hash.test(manifest.anchorRgbaSha256) ||
    !manifest.still || !localAsset.test(manifest.still.src) || manifest.still.src.includes("..") || !hash.test(manifest.still.sha256) ||
    !Number.isInteger(manifest.width) || !Number.isInteger(manifest.height) ||
    manifest.width < 64 || manifest.width > 1024 || manifest.height !== manifest.width ||
    !manifest.clips?.idle ||
    !manifest.assets || typeof manifest.assets !== "object" || Array.isArray(manifest.assets)) return false;
  let pixels = 0;
  for (const asset of Object.values(manifest.assets)) {
    if (!asset || !localAsset.test(asset.src) || asset.src.includes("..") || !hash.test(asset.sha256) || asset.alpha !== true ||
      !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < manifest.width ||
      asset.height < manifest.height || asset.width > 4096 || asset.height > 4096) return false;
    pixels += asset.width * asset.height;
  }
  // Encoded library size is distinct from the live decoded-page budget. Long
  // reviewed clips retain their frames; the player loads only the current page.
  if (pixels > 64 * 1024 * 1024) return false;
  for (const [name, clip] of Object.entries(manifest.clips)) {
    if (!actions.has(name) || !clip || !Array.isArray(clip.frames) || clip.frames.length < 2 || clip.frames.length > 600) return false;
    if (clip.frames[0].rgbaSha256 !== manifest.anchorRgbaSha256 || clip.frames.at(-1)!.rgbaSha256 !== manifest.anchorRgbaSha256) return false;
    let duration = 0;
    for (const frame of clip.frames) {
      if (!frame || typeof frame.asset !== "string" || !Object.hasOwn(manifest.assets, frame.asset)) return false;
      const asset = manifest.assets[frame.asset];
      if (!asset || !hash.test(frame.rgbaSha256) || !Number.isInteger(frame.x) || !Number.isInteger(frame.y) ||
        frame.x < 0 || frame.y < 0 || frame.x + manifest.width > asset.width || frame.y + manifest.height > asset.height ||
        !Number.isFinite(frame.durationMs) || frame.durationMs < 16 || frame.durationMs > 1000) return false;
      duration += frame.durationMs;
    }
    if (duration > 30_000) return false;
  }
  return true;
  } catch { return false; }
}

/** Shared bounded resource owner; pending loads are deduplicated too. Zero-ref entries are LRU. */
export class NaturalResourceCache<T> {
  private entries = new Map<string, { promise: Promise<T>; pixels: number; refs: number; touched: number; settled: boolean }>();
  private order = 0;
  constructor(private limit = NATURAL_DECODED_PIXEL_LIMIT) {}
  acquire(key: string, pixels: number, load: () => Promise<T>) {
    let entry = this.entries.get(key);
    if (!entry) {
      for (const [oldKey, old] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
        if (this.pixels + pixels <= this.limit) break;
        if (!old.refs && old.settled) this.entries.delete(oldKey);
      }
      if (pixels <= 0 || pixels > this.limit || this.pixels + pixels > this.limit) throw new Error("Natural animation decode budget exceeded");
      entry = { promise: Promise.resolve().then(load), pixels, refs: 0, touched: ++this.order, settled: false };
      this.entries.set(key, entry);
      const created = entry;
      void entry.promise.then(() => { created.settled = true; }, () => { if (this.entries.get(key) === created) this.entries.delete(key); });
    }
    entry.refs++; entry.touched = ++this.order;
    let released = false;
    return { promise: entry.promise, release: () => { if (!released) { released = true; entry!.refs--; } } };
  }
  get pixels() { return [...this.entries.values()].reduce((sum, value) => sum + value.pixels, 0); }
  get size() { return this.entries.size; }
  async settlePending() {
    const pending = [...this.entries.values()].filter(entry => !entry.settled).map(entry => entry.promise.catch(() => undefined));
    if (!pending.length) return false;
    await Promise.race(pending); return true;
  }
}

export function naturalClipDuration(clip: NaturalClip) {
  return clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
}
export function naturalFrameIndex(clip: NaturalClip, elapsed: number) {
  let end = 0;
  for (let index = 0; index < clip.frames.length; index++) {
    end += clip.frames[index].durationMs;
    if (elapsed < end) return index;
  }
  return clip.frames.length - 1;
}

export type NaturalRequest = { action: CharacterAction; playId: number; once: boolean };
/** Keeps an action request pending until the current complete clip reaches its anchor. */
export class NaturalMotionClock {
  private current: NaturalRequest = { action: "idle", playId: 0, once: true };
  private desired: NaturalRequest = this.current;
  private started: number | null = null;
  private completed = new Set<string>();
  private returning: { from: number; to: number; start: number; duration: number; shownAnchor: boolean } | null = null;
  constructor(private manifest: NaturalRuntimeManifest) {}
  request(request: NaturalRequest) { this.desired = request; }
  delay(ms: number) {
    if (this.started !== null) this.started += Math.max(0, ms);
    if (this.returning) this.returning.start += Math.max(0, ms);
  }
  private key(request: NaturalRequest) { return `${request.action}:${request.playId}`; }
  private finish(request: NaturalRequest, notify: (playId: number) => void) {
    const key = this.key(request);
    if (request.action === "idle" || this.completed.has(key)) return;
    this.completed.add(key);
    if (this.completed.size > 64) this.completed.delete(this.completed.values().next().value!);
    notify(request.playId);
  }
  reset(notify: (playId: number) => void) {
    this.finish(this.current, notify);
    this.finish(this.desired, notify);
    this.current = { action: "idle", playId: 0, once: true };
    this.started = null;
    this.returning = null;
  }
  sample(now: number, notify: (playId: number) => void) {
    if (this.started === null) {
      this.started = now;
      // A freshly visible player is already on the static common anchor.
      if (this.desired.action !== "idle" && this.manifest.clips[this.desired.action] && !this.completed.has(this.key(this.desired)))
        this.current = this.desired;
    }
    if (this.desired.action !== "idle" && !this.manifest.clips[this.desired.action]) this.finish(this.desired, notify);
    let clip = this.manifest.clips[this.current.action]!;
    // Idle is reviewed small-amplitude breathing. Retrace its existing drawings to
    // the nearest common endpoint; never morph/cross-fade or reverse a gesture.
    if (this.current.action === "idle" && now - this.started < naturalClipDuration(clip) &&
      !this.returning && this.desired.action !== "idle" && this.manifest.clips[this.desired.action] &&
      !this.completed.has(this.key(this.desired))) {
      const from = naturalFrameIndex(clip, now - this.started);
      const last = clip.frames.length - 1;
      const to = from < last - from ? 0 : last;
      const naturalMs = clip.frames.slice(Math.min(from, to), Math.max(from, to)).reduce((sum, f) => sum + f.durationMs, 0);
      this.returning = { from, to, start: now, duration: Math.min(NATURAL_IDLE_RETURN_MS, naturalMs), shownAnchor: false };
    }
    if (this.returning) {
      const back = this.returning;
      if (!back.shownAnchor) {
        const t = back.duration ? Math.min(1, Math.max(0, (now - back.start) / back.duration)) : 1;
        const eased = t * t * (3 - 2 * t);
        const frame = Math.round(back.from + (back.to - back.from) * eased);
        if (t === 1) back.shownAnchor = true;
        return { action: this.current.action, frame, clip };
      }
      this.returning = null;
      // Force the ordinary boundary transition only after the anchor was painted.
      this.started = now - naturalClipDuration(clip);
    }
    if (now - this.started >= naturalClipDuration(clip)) {
      const previous = this.current;
      if (previous.once) this.finish(previous, notify);
      const desired = this.desired;
      const playable = desired.action !== "idle" && this.manifest.clips[desired.action] && !this.completed.has(this.key(desired));
      this.current = playable ? desired : { action: "idle", playId: 0, once: true };
      // Start at the exact common anchor, including after a delayed browser frame.
      this.started = now;
      clip = this.manifest.clips[this.current.action]!;
    }
    return { action: this.current.action, frame: naturalFrameIndex(clip, now - this.started), clip };
  }
}
