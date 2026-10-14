import release from "./releases/h3-v2/manifest.json";
import type { CharacterAction } from "./character";

export const H3_CLIPS = ["idle-blink", "wave", "nod", "thanks", "thinking", "cheer", "yawn",
  "bed-pull", "bed-change", "headset-off", "bed-enter", "sleep-loop", "bed-wake", "headset-on", "bed-change-back", "bed-remove",
  "beach-props", "beach-change", "beach-sit", "beach-loop", "coconut-sip", "beach-stand", "beach-change-back", "beach-remove"] as const;
export type H3Clip = typeof H3_CLIPS[number];
export type H3Manifest = {
  version: string; width: number; height: number; columns: number; pageFrames: number;
  assets: Record<string, { src: string; width: number; height: number; sha256: string; alpha: boolean }>;
  stills: Record<H3Clip, { src: string; sha256: string }>;
  clips: Record<H3Clip, { pages: string[]; durations: number[]; frames: number; durationMs: number; loop: boolean; label: string; sourceRun: string; alphaExact: boolean }>;
  review: { aiArtReview: boolean; userAuthorizedRelease: boolean };
};
export const H3_MOTION = release as H3Manifest;
export const H3_DECODED_PIXEL_LIMIT = 6 * 1024 * 1024; // Three 1920x960 pages, about 22 MiB RGBA.
export const h3Action = (action: CharacterAction): H3Clip => action === "idle" ? "idle-blink" : action === "bow" ? "thanks" : action;

export function validH3Motion(m: H3Manifest): boolean {
  try {
    if (m.width !== 480 || m.height !== 480 || m.columns !== 4 || m.pageFrames !== 8 || !m.review.userAuthorizedRelease) return false;
    return H3_CLIPS.every(name => {
      const c = m.clips[name], still = m.stills[name];
      return !!c && c.frames >= 2 && c.frames <= 600 && c.durations.length === c.frames && c.alphaExact === true &&
        c.durations.every(d => Number.isFinite(d) && d >= 16 && d <= 1000) &&
        c.durations.reduce((a,b) => a+b,0) === c.durationMs && c.pages.length === Math.ceil(c.frames/8) &&
        c.pages.every(key => { const a = m.assets[key]; return a?.width === 1920 && a.height === 960 && a.alpha &&
          /^\/assistant\/h3-v2\/[a-z0-9-]+\.webp$/.test(a.src) && /^[a-f0-9]{64}$/.test(a.sha256); }) &&
        /^\/assistant\/h3-v2\/[a-z0-9-]+\.webp$/.test(still.src) && /^[a-f0-9]{64}$/.test(still.sha256);
    });
  } catch { return false; }
}
export function h3Frame(clip: H3Manifest["clips"][H3Clip], elapsed: number) {
  let until = 0;
  for (let i = 0; i < clip.frames; i++) { until += clip.durations[i]; if (elapsed < until) return i; }
  return clip.frames - 1;
}
type Request = { clip: H3Clip; playId: number };
/** Native chronological frames only. Finish the current clip before switching.
 * A completed one-shot holds its genuine final frame until its owner advances.
 * No reverse-idle, crossfade, injected anchor or artificial bridge.
 */
export class H3MotionClock {
  private current: Request = { clip: "idle-blink", playId: 0 };
  private desired = this.current;
  private started: number | null = null;
  private completed = new Set<string>();
  constructor(private manifest: H3Manifest) {}
  request(next: Request) { this.desired = next; }
  delay(ms: number) { if (this.started !== null) this.started += Math.max(0, ms); }
  sample(now: number, finish: (id: number) => void) {
    if (this.started === null) { this.started = now; this.current = this.desired; }
    let c = this.manifest.clips[this.current.clip];
    let elapsed = Math.max(0, now - this.started);
    if (elapsed >= c.durationMs) {
      const key = `${this.current.clip}:${this.current.playId}`;
      if (!c.loop && !this.completed.has(key)) {
        this.completed.add(key);
        if (this.completed.size > 64) this.completed.delete(this.completed.values().next().value!);
        finish(this.current.playId);
      }
      if (this.current.clip !== this.desired.clip || this.current.playId !== this.desired.playId) {
        this.current = this.desired; this.started = now; elapsed = 0; c = this.manifest.clips[this.current.clip];
      } else if (c.loop) { elapsed %= c.durationMs; this.started = now - elapsed; }
    }
    const frame = h3Frame(c, elapsed), slot = frame % this.manifest.pageFrames;
    return { clip: this.current.clip, frame, asset: c.pages[Math.floor(frame/8)],
      nextAsset: c.pages[Math.floor(frame/8)+1] ?? (c.loop ? c.pages[0] : undefined),
      x: (slot%4)*480, y: Math.floor(slot/4)*480 };
  }
}
