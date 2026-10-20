import { H3_DECODED_PIXEL_LIMIT, H3MotionClock, type H3Clip, type H3Manifest, type H3Request, type H3Sample } from "./h3-motion";

type Asset = H3Manifest["assets"][string];
type Lease<T> = { promise: Promise<T>; release: () => void; prioritize: () => void };
type Entry<T> = {
  key: string; pixels: number; refs: number; touched: number; required: boolean; state: "queued" | "loading" | "ready";
  promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void;
  load: (signal: AbortSignal) => Promise<T>; abort: AbortController; value?: T;
};

/** Owns at most three decoded or decoding pages across all H3 players. Queued
 * requests hold no image. Capacity changes wake the queue without polling. */
export class H3PageCache<T> {
  private entries = new Map<string, Entry<T>>();
  private active = new Set<Entry<T>>();
  private order = 0;
  private pumping = false;
  constructor(private pixelLimit = H3_DECODED_PIXEL_LIMIT, private pageLimit = 3, private dispose?: (value: T) => void) {}

  acquire(key: string, pixels: number, load: (signal: AbortSignal) => Promise<T>, required = false): Lease<T> {
    if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > this.pixelLimit) throw new Error("Animation decode budget exceeded");
    let entry = this.entries.get(key);
    if (entry && entry.pixels !== pixels) throw new Error("Animation cache identity mismatch");
    if (!entry) {
      let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
      const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
      // Cancellation may release a speculative request before a consumer awaits it.
      void promise.catch(() => undefined);
      entry = { key, pixels, refs: 0, touched: ++this.order, required, state: "queued", promise, resolve, reject, load, abort: new AbortController() };
      this.entries.set(key, entry);
    }
    entry.refs++; entry.touched = ++this.order; entry.required ||= required;
    this.pump();
    let released = false;
    const owned = entry;
    return { promise: entry.promise, prioritize: () => { owned.required = true; this.pump(); }, release: () => {
      if (released) return;
      released = true; owned.refs--;
      if (!owned.refs && owned.state === "queued") {
        this.entries.delete(owned.key); owned.reject(new Error("Animation request cancelled"));
      } else if (!owned.refs && owned.state === "loading") {
        // Keep its reservation until the loader actually settles. This prevents
        // an abort-ignoring browser from starting an unbounded fourth decode.
        if (this.entries.get(owned.key) === owned) this.entries.delete(owned.key);
        owned.abort.abort();
      }
      this.pump();
    } };
  }
  get pixels() { return [...this.active].reduce((sum, entry) => sum + entry.pixels, 0); }
  get size() { return this.active.size; }
  get queued() { return [...this.entries.values()].filter(entry => entry.state === "queued").length; }

  private removeReady(entry: Entry<T>) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    this.active.delete(entry);
    // Disposing a browser image is best-effort; it must not strand queue waiters.
    if (entry.value !== undefined) { try { this.dispose?.(entry.value); } catch {} }
  }
  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (const entry of [...this.entries.values()].sort((a, b) => Number(b.required) - Number(a.required) || a.touched - b.touched)) {
        if (entry.state !== "queued" || !entry.refs) continue;
        const fits = () => this.active.size < this.pageLimit && this.pixels + entry.pixels <= this.pixelLimit;
        for (const old of [...this.active].sort((a, b) => a.touched - b.touched)) {
          if (fits()) break;
          if (!old.refs && old.state === "ready") this.removeReady(old);
        }
        if (!fits()) break;
        entry.state = "loading"; this.active.add(entry);
        void Promise.resolve().then(() => entry.load(entry.abort.signal)).then(value => {
          entry.state = "ready"; entry.value = value;
          if (!entry.refs || entry.abort.signal.aborted) { this.removeReady(entry); entry.reject(new Error("Animation request cancelled")); }
          else entry.resolve(value);
          this.pump();
        }, error => {
          if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
          this.active.delete(entry); entry.reject(error); this.pump();
        });
      }
    } finally { this.pumping = false; }
  }
}

/** onload alone can leave decoding on the first draw. Older browsers without
 * decode retain their onload path; decode rejection/timeout fails to the still. */
export function loadH3Image(asset: Asset, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Animation load/decode timed out")), 12000);
    function abort() { finish(new Error("Animation load cancelled")); }
    function finish(error?: Error) {
      if (settled) return;
      settled = true; clearTimeout(timeout); image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort);
      if (error) { image.src = ""; reject(error); } else resolve(image);
    }
    image.onload = () => {
      if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) { finish(new Error("Animation size mismatch")); return; }
      if (typeof image.decode !== "function") { finish(); return; }
      void Promise.resolve().then(() => image.decode()).then(() => {
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) finish(new Error("Animation decoded size mismatch"));
        else finish();
      }, () => finish(new Error("Animation decode unavailable")));
    };
    image.onerror = () => finish(new Error("Animation unavailable"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else image.src = asset.src;
  });
}

export type H3PlayerRequest = H3Request & { animate: boolean; nextClip?: H3Clip };
export type H3PlayerEnvironment<T> = {
  now: () => number; requestFrame: (callback: (now: number) => void) => number; cancelFrame: (id: number) => void;
  load: (asset: Asset, signal: AbortSignal) => Promise<T>; paint: (image: T, sample: H3Sample, manifest: H3Manifest) => void;
  onFinished: (playId: number) => void; onFailed: () => void;
};
type Page<T> = { lease: Lease<T>; image?: T; ready: boolean; failed: boolean };

/** A single scheduler owns sampling, drawing and loading resumption. Both
 * explicit pause and missing required images freeze native animation time. */
export class H3Player<T> {
  private clock: H3MotionClock;
  private pendingManifest: H3Manifest | null = null;
  private pages = new Map<string, Page<T>>();
  private request: H3PlayerRequest = { clip: "idle-blink", playId: 0, animate: false };
  private frame: number | null = null;
  private frozenAt: number | null = null;
  private held: H3Sample | null = null;
  private disposed = false;
  private broken = false;
  private revision = 0;
  private drawn = "";
  private currentAsset: string | null = null;
  private finished = new Set<string>();
  constructor(private manifest: H3Manifest, private cache: H3PageCache<T>, private env: H3PlayerEnvironment<T>) { this.clock = new H3MotionClock(manifest); }

  /** The two sizes must describe exactly the same native motion. Preference
   * changes only queue a switch; hidden/paused playback never advances it. */
  requestManifest(manifest: H3Manifest): boolean {
    if (this.disposed || this.broken) return false;
    if (manifest === this.manifest) { this.pendingManifest = null; return true; }
    if (!Object.keys(this.manifest.clips).every(name => {
      const key = name as H3Clip, a = this.manifest.clips[key], b = manifest.clips[key];
      return b && a.frames === b.frames && a.durationMs === b.durationMs && a.loop === b.loop &&
        a.durations.every((duration, index) => duration === b.durations[index]);
    })) return false;
    this.pendingManifest = manifest;
    return true;
  }

  update(request: H3PlayerRequest) {
    if (this.disposed || this.broken) return;
    this.revision++; this.cancel(); this.request = request; this.clock.request(request);
    const now = this.env.now();
    if (!request.animate) {
      this.freeze(now);
      // A hidden/reduced-motion player need not pin speculative pages and block
      // a second active player using the shared three-page budget.
      const keep = this.held?.asset ?? this.currentAsset;
      for (const [key, page] of this.pages) if (key !== keep) { page.lease.release(); this.pages.delete(key); }
      return;
    }
    if (!this.held) this.resume(now);
    this.paint(now);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.revision++; this.cancel();
    for (const page of this.pages.values()) page.lease.release();
    this.pages.clear();
  }
  private freeze(now: number) { this.frozenAt ??= now; }
  private resume(now: number) { if (this.frozenAt !== null) this.clock.delay(now - this.frozenAt); this.frozenAt = null; }
  private cancel() { if (this.frame !== null) this.env.cancelFrame(this.frame); this.frame = null; }
  private schedule() {
    if (this.frame !== null || this.disposed || this.broken || !this.request.animate) return;
    this.frame = this.env.requestFrame(now => { this.frame = null; this.paint(now); });
  }
  private notify(playId: number, clip: H3Clip) {
    const key = `${clip}:${playId}`;
    if (this.finished.has(key)) return;
    this.finished.add(key);
    if (this.finished.size > 64) this.finished.delete(this.finished.values().next().value!);
    this.env.onFinished(playId);
  }
  private fail() {
    if (this.disposed || this.broken) return;
    this.broken = true; this.cancel();
    for (const page of this.pages.values()) page.lease.release();
    this.pages.clear();
    this.env.onFailed(); this.notify(this.request.playId, this.request.clip);
  }
  private acquire(key: string, required = false) {
    let page = this.pages.get(key);
    if (page) { if (required) page.lease.prioritize(); return page; }
    const asset = this.manifest.assets[key];
    const lease = this.cache.acquire(`${this.manifest.version}:${asset.sha256}:${asset.src}`, asset.width * asset.height, signal => this.env.load(asset, signal), required);
    page = { lease, ready: false, failed: false }; this.pages.set(key, page);
    const owned = page;
    void lease.promise.then(image => {
      if (this.disposed || this.broken || this.pages.get(key) !== owned) return;
      owned.image = image; owned.ready = true;
      if (this.held?.asset === key) this.schedule();
    }, () => {
      if (this.disposed || this.broken || this.pages.get(key) !== owned) return;
      // A speculative failure must not interrupt the current page. When this
      // page becomes required, the ordinary failure path shows the fallback.
      owned.failed = true;
      if (this.held?.asset === key) this.schedule();
    });
    return page;
  }
  private paint(now: number) {
    if (this.disposed || this.broken || !this.request.animate) return;
    const revision = this.revision;
    let sample = this.held ?? this.clock.sample(now, (id, clip) => this.notify(id, clip));
    if (revision !== this.revision || this.disposed || this.broken || !this.request.animate) return;
    if (this.pendingManifest && (!this.drawn || sample.boundary || sample.finished)) {
      for (const page of this.pages.values()) page.lease.release();
      this.pages.clear(); this.held = null; this.frozenAt = null; this.drawn = "";
      this.manifest = this.pendingManifest; this.pendingManifest = null;
      this.clock.replaceManifest(this.manifest, now, sample.finished);
      sample = this.clock.sample(now, (id, clip) => this.notify(id, clip));
    }
    this.currentAsset = sample.asset;
    const target = sample.lastPage ? (sample.desiredAsset ?? (this.request.nextClip ? this.manifest.clips[this.request.nextClip].pages[0] : undefined)) : undefined;
    // Current and immediate-next always win. A known transition is prepared
    // only in the final page; otherwise the third slot buffers two pages ahead.
    const keys = [...new Set([sample.asset, sample.nextAsset, target ?? sample.lookaheadAsset].filter((key): key is string => !!key))].slice(0, 3);
    for (const [key, page] of this.pages) if (!keys.includes(key)) { page.lease.release(); this.pages.delete(key); }
    let page: Page<T>;
    try {
      page = this.acquire(sample.asset, true);
      for (const key of keys) if (key !== sample.asset) this.acquire(key);
    } catch { this.fail(); return; }
    if (page.failed) { this.fail(); return; }
    if (!page.ready) { this.held = sample; this.freeze(now); return; }
    this.held = null; this.resume(now);
    const identity = `${sample.clip}:${sample.asset}:${sample.frame}`;
    if (identity !== this.drawn) {
      try { this.env.paint(page.image!, sample, this.manifest); } catch { this.fail(); return; }
      this.drawn = identity;
    }
    if (!sample.finished) this.schedule();
  }
}
