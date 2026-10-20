import release from "./releases/h3-v5/manifest.json";
import mobileRelease from "./releases/h3-mobile-v3/manifest.json";
import type { CharacterAction } from "./character";

export const H3_CLIPS = ["idle-blink", "wave", "nod", "thanks", "thinking", "cheer", "yawn"] as const;
export type H3Clip = typeof H3_CLIPS[number];
export type H3Manifest = {
  version: string; width: number; height: number; columns: number; pageFrames: number;
  assets: Record<string, { src: string; width: number; height: number; sha256: string; alpha: boolean }>;
  stills: Record<H3Clip, { src: string; sha256: string }>;
  clips: Record<H3Clip, { pages: string[]; durations: number[]; frames: number; durationMs: number; loop: boolean; label: string; sourceRun: string; alphaExact: boolean; scaledAlphaPreserved?: boolean; rgbLossless?: boolean }>;
  review: { aiArtReview: boolean; userAuthorizedRelease: boolean };
  encoding?: { rgbQuality: number; alphaQuality: number; visibleRgbLossy: boolean; scaledAlphaPreserved: boolean };
  release?: { sourceVersion: string; includedClips: string[]; sceneClipsRemoved: boolean; mediaBytesUnchanged: boolean };
  candidate?: { localOnly: boolean; [key: string]: unknown };
};
export const H3_MOTION = release as H3Manifest;
export const H3_MOBILE_MOTION = mobileRelease as H3Manifest;
export const H3_BASIC_CLIPS = H3_CLIPS;
export const H3_DECODED_PIXEL_LIMIT = 6 * 1024 * 1024;
export const h3Action = (action: CharacterAction): H3Clip => action === "idle" ? "idle-blink" : action === "bow" ? "thanks" : action;

/** Seven selected basic clips only. Existing versioned media bytes are unchanged;
 * new manifests never inherit or fall back to removed day/night releases. */
export function validH3Motion(m: H3Manifest): boolean {
  try {
    const mobile = m.version === "h3-motion-mobile-v3";
    if (!mobile && m.version !== "h3-motion-v5") return false;
    const size = mobile ? 320 : 480, prefix = mobile ? "h3-mobile-v2" : "h3-v4";
    if (m.width !== size || m.height !== size || m.columns !== 4 || m.pageFrames !== 8 ||
      m.review?.userAuthorizedRelease !== true || m.review.aiArtReview !== false || m.candidate !== undefined ||
      m.encoding?.rgbQuality !== (mobile ? 85 : 90) || m.encoding.alphaQuality !== 100 ||
      m.encoding.visibleRgbLossy !== true || m.encoding.scaledAlphaPreserved !== true ||
      m.release?.sourceVersion !== (mobile ? "h3-motion-mobile-v2" : "h3-motion-v4") ||
      m.release.sceneClipsRemoved !== true || m.release.mediaBytesUnchanged !== true ||
      m.release.includedClips.length !== H3_CLIPS.length ||
      !H3_CLIPS.every((clip, index) => m.release!.includedClips[index] === clip) ||
      Object.keys(m.clips).length !== H3_CLIPS.length || Object.keys(m.stills).length !== H3_CLIPS.length) return false;
    const used = new Set<string>(), sources = new Set<string>();
    const validSource = (src: string, hash: string) => new RegExp(`^/assistant/${prefix}/[a-z0-9-]+\\.webp$`).test(src) && /^[a-f0-9]{64}$/.test(hash);
    for (const name of H3_CLIPS) {
      const c = m.clips[name], still = m.stills[name];
      if (!c || !still || c.frames !== 124 || !Array.isArray(c.durations) || c.durations.length !== c.frames ||
        !c.durations.every(d => Number.isFinite(d) && Math.abs(d - 1000 / 24) < 1e-10) ||
        !Number.isFinite(c.durationMs) || Math.abs(c.durationMs - 124000 / 24) > 1e-8 ||
        Math.abs(c.durations.reduce((a,b) => a+b,0) - c.durationMs) > 1e-8 ||
        !Array.isArray(c.pages) || c.pages.length !== Math.ceil(c.frames / 8) || new Set(c.pages).size !== c.pages.length ||
        c.scaledAlphaPreserved !== true || c.rgbLossless !== false || c.alphaExact !== false ||
        typeof c.label !== "string" || !c.label || typeof c.sourceRun !== "string" || !c.sourceRun ||
        c.loop !== (name === "idle-blink") || !validSource(still.src, still.sha256) || sources.has(still.src)) return false;
      sources.add(still.src);
      for (const key of c.pages) {
        const a = m.assets[key];
        if (!a || a.width !== size * 4 || a.height !== size * 2 || a.alpha !== true ||
          used.has(key) || sources.has(a.src) || !validSource(a.src, a.sha256)) return false;
        used.add(key); sources.add(a.src);
      }
    }
    return Object.keys(m.assets).length === used.size && Object.keys(m.assets).every(key => used.has(key));
  } catch { return false; }
}
export function h3Frame(clip: H3Manifest["clips"][H3Clip], elapsed: number) {
  let until = 0;
  for (let i = 0; i < clip.frames; i++) { until += clip.durations[i]; if (elapsed < until) return i; }
  return clip.frames - 1;
}
export type H3Request = { clip: H3Clip; playId: number; once?:boolean };
/** Native chronological frames only. Finish the current clip before switching.
 * A completed one-shot holds its genuine final frame until its owner advances.
 * No reverse-idle, crossfade, injected anchor or artificial bridge.
 */
export class H3MotionClock {
  private current: H3Request = { clip: "idle-blink", playId: 0 };
  private desired = this.current;
  private started: number | null = null;
  private completed = new Set<string>();
  constructor(private manifest: H3Manifest) {}
  request(next: H3Request) { this.desired = next; }
  delay(ms: number) { if (this.started !== null) this.started += Math.max(0, ms); }
  /** Only the player calls this after a natural boundary (or before first draw).
   * A completed one-shot remains completed; changing resources never replays it. */
  replaceManifest(manifest: H3Manifest, now: number, finished: boolean) {
    this.manifest = manifest;
    this.started = finished ? now - manifest.clips[this.current.clip].durationMs : now;
  }
  sample(now: number, finish: (id: number, clip: H3Clip) => void) {
    if (this.started === null) { this.started = now; this.current = this.desired; }
    let c = this.manifest.clips[this.current.clip];
    let elapsed = Math.max(0, now - this.started);
    const boundary = elapsed >= c.durationMs;
    if (boundary) {
      const key = `${this.current.clip}:${this.current.playId}`;
      if ((!c.loop || this.current.once) && !this.completed.has(key)) {
        this.completed.add(key);
        if (this.completed.size > 64) this.completed.delete(this.completed.values().next().value!);
        finish(this.current.playId, this.current.clip);
      }
      if (this.current.clip !== this.desired.clip || this.current.playId !== this.desired.playId) {
        this.current = this.desired; this.started = now; elapsed = 0; c = this.manifest.clips[this.current.clip];
      } else if (c.loop && !this.current.once) { elapsed %= c.durationMs; this.started = now - elapsed; }
    }
    const frame = h3Frame(c, elapsed), slot = frame % this.manifest.pageFrames, page = Math.floor(frame / this.manifest.pageFrames);
    const repeating = c.loop && !this.current.once;
    const ahead = (distance: number) => c.pages[page + distance] ?? (repeating ? c.pages[(page + distance) % c.pages.length] : undefined);
    const pending = this.current.clip !== this.desired.clip || this.current.playId !== this.desired.playId;
    return { clip: this.current.clip, frame, boundary, asset: c.pages[page], nextAsset: ahead(1), lookaheadAsset: ahead(2),
      desiredAsset: pending ? this.manifest.clips[this.desired.clip].pages[0] : undefined,
      lastPage: page === c.pages.length - 1, finished: !repeating && elapsed >= c.durationMs,
      x: (slot % this.manifest.columns) * this.manifest.width, y: Math.floor(slot / this.manifest.columns) * this.manifest.height };
  }
}
export type H3Sample = ReturnType<H3MotionClock["sample"]>;
