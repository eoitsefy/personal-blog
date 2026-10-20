import legacyRelease from "./releases/h3-v3/manifest.json";
import legacyMobile from "./releases/h3-mobile-v1/manifest.json";
import release from "./releases/h3-v4/manifest.json";
import mobileRelease from "./releases/h3-mobile-v2/manifest.json";
import type { CharacterAction } from "./character";

export const H3_CLIPS = ["idle-blink", "wave", "nod", "thanks", "thinking", "cheer", "yawn",
  "bed-pull", "bed-change", "headset-off", "bed-enter", "sleep-loop", "bed-wake", "headset-on", "bed-change-back", "bed-remove",
  "beach-props", "beach-change", "beach-sit", "beach-loop", "coconut-sip", "beach-stand", "beach-change-back", "beach-remove"] as const;
export type H3Clip = typeof H3_CLIPS[number];
export type H3Manifest = {
  version: string; width: number; height: number; columns: number; pageFrames: number;
  assets: Record<string, { src: string; width: number; height: number; sha256: string; alpha: boolean }>;
  stills: Record<H3Clip, { src: string; sha256: string }>;
  clips: Record<H3Clip, { pages: string[]; durations: number[]; frames: number; durationMs: number; loop: boolean; label: string; sourceRun: string; alphaExact: boolean; scaledAlphaPreserved?: boolean; rgbLossless?: boolean }>;
  review: { aiArtReview: boolean; userAuthorizedRelease: boolean };
  encoding?: { rgbQuality: number; alphaQuality: number; visibleRgbLossy: boolean; scaledAlphaPreserved: boolean };
  release?: { sourceVersion: string; replacedClips: string[]; preservedSceneMotion: boolean };
  candidate?: { localOnly: boolean; resampled: boolean; scaledAlphaPreserved: boolean; sourceVersion: string; [key: string]: unknown };
};
export const H3_LEGACY_MOTION = legacyRelease as H3Manifest;
export const H3_MOTION = release as H3Manifest;
export const H3_MOBILE_MOTION = mobileRelease as H3Manifest;
export const H3_BASIC_CLIPS = H3_CLIPS.slice(0, 7);
export const H3_DECODED_PIXEL_LIMIT = 6 * 1024 * 1024; // Three desktop pages own about 21.1 MiB RGBA.
export const h3Action = (action: CharacterAction): H3Clip => action === "idle" ? "idle-blink" : action === "bow" ? "thanks" : action;

function validLegacyH3Motion(m: H3Manifest): boolean {
  try {
    if (m.width !== 480 || m.height !== 480 || m.columns !== 4 || m.pageFrames !== 8 || !m.review.userAuthorizedRelease) return false;
    return H3_CLIPS.every(name => {
      const c = m.clips[name], still = m.stills[name];
      return !!c && c.frames >= 2 && c.frames <= 600 && c.durations.length === c.frames && c.alphaExact === true &&
        c.durations.every(d => Number.isFinite(d) && d >= 16 && d <= 1000) &&
        c.durations.reduce((a,b) => a+b,0) === c.durationMs && c.pages.length === Math.ceil(c.frames/8) &&
        c.pages.every(key => { const a = m.assets[key]; return a?.width === 1920 && a.height === 960 && a.alpha &&
          /^\/assistant\/h3-v[23]\/[a-z0-9-]+\.webp$/.test(a.src) && /^[a-f0-9]{64}$/.test(a.sha256); }) &&
        /^\/assistant\/h3-v[23]\/[a-z0-9-]+\.webp$/.test(still.src) && /^[a-f0-9]{64}$/.test(still.sha256);
    });
  } catch { return false; }
}

/** These two releases permit visible RGB compression only with explicit native
 * timing and scaled-alpha metadata. Historical/candidate gates stay separate. */
export function validH3Motion(m: H3Manifest): boolean {
  if (m?.version === H3_LEGACY_MOTION.version) return validLegacyH3Motion(m);
  try {
    const mobile = m.version === "h3-motion-mobile-v2";
    if (!mobile && m.version !== "h3-motion-v4") return false;
    const size = mobile ? 320 : 480, prefix = mobile ? "h3-mobile-v2" : "h3-v4";
    if (m.width !== size || m.height !== size || m.columns !== 4 || m.pageFrames !== 8 ||
      m.review?.userAuthorizedRelease !== true || m.review.aiArtReview !== false || m.candidate?.localOnly === true ||
      m.encoding?.rgbQuality !== (mobile ? 85 : 90) || m.encoding.alphaQuality !== 100 ||
      m.encoding.visibleRgbLossy !== true || m.encoding.scaledAlphaPreserved !== true ||
      m.release?.sourceVersion !== H3_LEGACY_MOTION.version || m.release.preservedSceneMotion !== true ||
      m.release.replacedClips.length !== 7 || !H3_BASIC_CLIPS.every((clip, i) => m.release!.replacedClips[i] === clip) ||
      Object.keys(m.clips).length !== 24 || Object.keys(m.stills).length !== 24) return false;
    const used = new Set<string>(), sources = new Set<string>();
    const validSource = (src: string, hash: string) => new RegExp(`^/assistant/${prefix}/[a-z0-9-]+\\.webp$`).test(src) && /^[a-f0-9]{64}$/.test(hash);
    for (const name of H3_CLIPS) {
      const c = m.clips[name], still = m.stills[name], basic = H3_BASIC_CLIPS.includes(name);
      const original = (mobile ? legacyMobile : legacyRelease).clips[name];
      if (!c || !still || !Number.isSafeInteger(c.frames) || c.frames < 2 || c.frames > 600 ||
        !Array.isArray(c.durations) || c.durations.length !== c.frames || !c.durations.every(d => Number.isFinite(d) && d >= 16 && d <= 1000) ||
        !Number.isFinite(c.durationMs) || Math.abs(c.durations.reduce((a,b) => a+b,0) - c.durationMs) > 1e-8 ||
        c.pages.length !== Math.ceil(c.frames / 8) || new Set(c.pages).size !== c.pages.length ||
        c.scaledAlphaPreserved !== true || c.rgbLossless !== (!mobile && !basic) || c.alphaExact !== (!mobile && !basic) ||
        typeof c.label !== "string" || !c.label || typeof c.sourceRun !== "string" || !c.sourceRun ||
        typeof c.loop !== "boolean") return false;
      if (basic) {
        if (c.frames !== 124 || Math.abs(c.durationMs - 124000 / 24) > 1e-8 ||
          !c.durations.every(d => Math.abs(d - 1000 / 24) < 1e-10) || c.loop !== (name === "idle-blink") ||
          !validSource(still.src, still.sha256)) return false;
      } else {
        if (c.frames !== original.frames || c.durationMs !== original.durationMs || c.loop !== original.loop || c.sourceRun !== original.sourceRun ||
          !c.durations.every((d, i) => d === original.durations[i]) || c.pages.length !== original.pages.length ||
          still.src !== (mobile ? legacyMobile : legacyRelease).stills[name].src ||
          still.sha256 !== (mobile ? legacyMobile : legacyRelease).stills[name].sha256) return false;
      }
      for (let i = 0; i < c.pages.length; i++) {
        const key = c.pages[i], a = m.assets[key];
        if (!a || a.width !== size * 4 || a.height !== size * 2 || a.alpha !== true || used.has(key) || sources.has(a.src)) return false;
        used.add(key); sources.add(a.src);
        if (basic) { if (!validSource(a.src, a.sha256)) return false; }
        else {
          const old = (mobile ? legacyMobile : legacyRelease).assets[original.pages[i] as keyof typeof legacyRelease.assets];
          if (!old || a.src !== old.src || a.sha256 !== old.sha256) return false;
        }
      }
    }
    return Object.keys(m.assets).length === used.size && Object.keys(m.assets).every(key => used.has(key));
  } catch { return false; }
}

/** Explicit local preview only. This gate is not release or visual approval. */
export function validH3CandidateRuntime(value: unknown): value is H3Manifest {
  try {
    const m = value as H3Manifest;
    if (!m || m.version !== "h3-mobile-v1" || m.width !== 320 || m.height !== 320 || m.columns !== 4 || m.pageFrames !== 8 ||
      m.review?.aiArtReview !== false || m.review.userAuthorizedRelease !== false ||
      m.candidate?.localOnly !== true || m.candidate.resampled !== true || m.candidate.scaledAlphaPreserved !== true ||
      m.candidate.sourceVersion !== H3_LEGACY_MOTION.version || !m.assets || !m.clips || !m.stills ||
      Object.keys(m.clips).length !== H3_CLIPS.length || Object.keys(m.stills).length !== H3_CLIPS.length ||
      Object.keys(m.assets).length !== Object.keys(H3_LEGACY_MOTION.assets).length) return false;
    const validSource = (src: string, hash: string) => /^\/assistant\/h3-mobile-v1\/[a-z0-9-]+\.webp$/.test(src) && /^[a-f0-9]{64}$/.test(hash);
    if (!Object.keys(H3_LEGACY_MOTION.assets).every(key => Object.hasOwn(m.assets, key))) return false;
    return H3_CLIPS.every(name => {
      const c = m.clips[name], original = H3_LEGACY_MOTION.clips[name], still = m.stills[name];
      return !!c && c.alphaExact === false && c.frames === original.frames && c.durationMs === original.durationMs && c.loop === original.loop &&
        Array.isArray(c.durations) && c.durations.length === original.durations.length && c.durations.every((d, index) => d === original.durations[index]) &&
        Array.isArray(c.pages) && c.pages.length === original.pages.length && c.pages.every((key, index) => {
          const a = m.assets[key];
          return key === original.pages[index] && !!a && a.width === 1280 && a.height === 640 && a.alpha === true && validSource(a.src, a.sha256);
        }) && !!still && validSource(still.src, still.sha256);
    });
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
