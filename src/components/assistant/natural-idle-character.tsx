"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NATURAL_IDLE } from "@/lib/assistant/appearance";
import type { CharacterAction } from "@/lib/assistant/character";
import { NATURAL_MOTION, NaturalMotionClock, NaturalResourceCache, validNaturalMotion, type NaturalRuntimeManifest } from "@/lib/assistant/natural-motion";
import styles from "./assistant-panel.module.css";

function motionAvailable() {
  return !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function subscribeMotion(notify: () => void) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  reduced.addEventListener("change", notify);
  document.addEventListener("visibilitychange", notify);
  return () => { reduced.removeEventListener("change", notify); document.removeEventListener("visibilitychange", notify); };
}

const decodedPages = new NaturalResourceCache<HTMLImageElement>();
function decodePage(asset: NaturalRuntimeManifest["assets"][string]) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const timeout = window.setTimeout(() => done(new Error("Natural animation page load/decode timed out")), 12_000);
    function done(error?: Error) {
      if (settled) return;
      settled = true; window.clearTimeout(timeout); image.onload = null; image.onerror = null;
      if (error) { image.src = ""; reject(error); } else resolve(image);
    }
    image.onload = async () => {
      try {
        await image.decode();
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error("Natural animation page dimensions changed");
        done();
      } catch (error) { done(error instanceof Error ? error : new Error("Natural animation decode failed")); }
    };
    image.onerror = () => done(new Error("Natural animation page unavailable"));
    image.src = asset.src;
  });
}
type Props = { action?: CharacterAction; animate?: boolean; active?: boolean; playId?: number; once?: boolean; onFinished?: (playId: number) => void };
export function NaturalIdleCharacter({ action = "idle", animate = true, active = true, playId = 0, once = true, onFinished }: Props) {
  const available = useSyncExternalStore(subscribeMotion, motionAvailable, () => false);
  const [failed, setFailed] = useState(false);
  const moving = animate && active && available && !failed;
  const completion = useRef(onFinished);
  const completed = useRef(new Set<number>());
  useEffect(() => { completion.current = onFinished; }, [onFinished]);
  const manifest = validNaturalMotion(NATURAL_MOTION) ? NATURAL_MOTION : null;
  useEffect(() => {
    if (!active || action === "idle" || (manifest && !failed) || completed.current.has(playId)) return;
    // No action asset (or motion disabled): settle the behavior without switching skins.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || completed.current.has(playId)) return;
      completed.current.add(playId);
      if (completed.current.size > 64) completed.current.delete(completed.current.values().next().value!);
      completion.current?.(playId);
    });
    return () => { cancelled = true; };
  }, [action, active, failed, manifest, playId]);
  if (manifest && !failed) return <NaturalMotionCanvas manifest={manifest} action={action} playId={playId} once={once}
    animate={animate} active={active} available={available} onFinished={onFinished} onFailed={() => setFailed(true)} />;
  // Keep the accepted canvas fixed. No CSS body movement or old-pose blending.
  // The static first frame also covers reduced motion, hidden tabs and failures.
  return <span className={styles.character} data-engine="natural-idle" data-character-version={NATURAL_IDLE.version} data-animated={moving} aria-hidden="true">
    <Image className={styles.fallbackCharacter} src={manifest ? manifest.still.src : moving ? NATURAL_IDLE.animated : NATURAL_IDLE.still}
      width={manifest?.width ?? NATURAL_IDLE.size} height={manifest?.height ?? NATURAL_IDLE.size} alt="" unoptimized loading="eager"
      onError={() => setFailed(true)} />
  </span>;
}

export function NaturalMotionCanvas({ manifest, action, playId, once, animate, active, available, onFinished, onFailed }:
  Required<Pick<Props, "action" | "playId" | "once" | "animate" | "active">> &
  { manifest: NaturalRuntimeManifest; available: boolean; onFinished?: Props["onFinished"]; onFailed: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);
  const callbacks = useRef({ onFinished, onFailed });
  const controls = useRef({ action, playId, once, animate, active, available });
  const refresh = useRef<(() => void) | null>(null);
  const completed = useRef(new Set<number>());
  useEffect(() => { callbacks.current = { onFinished, onFailed }; }, [onFinished, onFailed]);
  useEffect(() => {
    controls.current = { action, playId, once, animate, active, available };
    refresh.current?.();
  }, [action, playId, once, active, animate, available]);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) { callbacks.current.onFailed(); return; }
    let disposed = false, tick = 0, revision = 0, pausedAt: number | null = null;
    const images = new Map<string, HTMLImageElement>();
    const leases = new Map<string, ReturnType<typeof decodedPages.acquire>>();
    const timeline = new NaturalMotionClock(manifest);
    let heldSample: ReturnType<NaturalMotionClock["sample"]> | null = null;
    const finish = (id: number) => {
      if (disposed || !controls.current.active || completed.current.has(id)) return;
      completed.current.add(id);
      if (completed.current.size > 64) completed.current.delete(completed.current.values().next().value!);
      callbacks.current.onFinished?.(id);
    };
    element.dataset.ready = "false";
    // The common static anchor remains underneath until the active clip is ready.
    element.style.visibility = "hidden";
    if (fallback.current) fallback.current.style.visibility = "visible";
    function retain(keys: Set<string>) {
      for (const [key, lease] of leases) if (!keys.has(key)) { lease.release(); leases.delete(key); images.delete(key); }
    }
    async function loadPage(key: string, required: boolean, change: number): Promise<void> {
      if (images.has(key)) return;
      let lease = leases.get(key);
      if (lease && !required) return;
      if (!lease) {
        const asset = manifest.assets[key];
        try {
          lease = decodedPages.acquire(`${asset.src}:${asset.sha256}`, asset.width * asset.height, () => decodePage(asset));
        } catch (error) {
          // A large optional next page can wait until the current atlas is freed.
          if (!required) return;
          if (await decodedPages.settlePending() && !disposed && change === revision) return loadPage(key, true, change);
          throw error;
        }
        leases.set(key, lease);
      }
      try {
        const image = await lease.promise;
        if (!disposed && leases.get(key) === lease) images.set(key, image);
      } catch (error) {
        if (leases.get(key) === lease) { lease.release(); leases.delete(key); images.delete(key); }
        if (required) throw error;
      }
    }
    function paint(now: number) {
      if (disposed) return;
      const c = controls.current;
      if (!c.animate || !c.active || !c.available) return;
      const sample = heldSample ?? timeline.sample(now, finish);
      const frame = sample.clip.frames[sample.frame], source = images.get(frame.asset);
      const following = sample.clip.frames.slice(sample.frame + 1).find(candidate => candidate.asset !== frame.asset)?.asset;
      retain(new Set([frame.asset, ...(following ? [following] : [])]));
      if (!source) {
        retain(new Set([frame.asset]));
        const change = revision;
        heldSample = sample; pausedAt ??= now;
        // Keep the already painted drawing while paging. Hold both animation
        // time and the sampled anchor, so a slow decode never skips a boundary.
        void loadPage(frame.asset, true, change).then(() => {
          if (disposed || change !== revision) return;
          const resumed = performance.now();
          if (pausedAt !== null) timeline.delay(resumed - pausedAt);
          pausedAt = null; paint(resumed);
        }).catch(() => { if (!disposed && change === revision) callbacks.current.onFailed(); });
        return;
      }
      heldSample = null;
      context!.clearRect(0, 0, manifest.width, manifest.height);
      context!.drawImage(source, frame.x, frame.y, manifest.width, manifest.height, 0, 0, manifest.width, manifest.height);
      element!.dataset.playing = sample.action;
      element!.dataset.frame = String(sample.frame);
      element!.dataset.ready = "true";
      element!.style.visibility = "visible";
      if (fallback.current) fallback.current.style.visibility = "hidden";
      // Only current + next page, never an entire clip or library. Cache memory
      // is independent of clip duration and shared by launcher/dialog instances.
      if (following) void loadPage(following, false, revision);
      tick = requestAnimationFrame(paint);
    }
    function update() {
      revision++; const c = controls.current;
      cancelAnimationFrame(tick);
      pausedAt ??= performance.now();
      timeline.request({ action: c.action, playId: c.playId, once: c.once });
      if (!c.animate || !c.active || !c.available) {
        // No decoded atlas requests for an inactive/hidden instance. The shared
        // LRU may retain a bounded page for instant handoff to the visible one.
        timeline.reset(finish); heldSample = null; pausedAt = null;
        leases.forEach(lease => lease.release()); leases.clear(); images.clear();
        element!.style.visibility = "hidden";
        if (fallback.current) fallback.current.style.visibility = "visible";
        return;
      }
      const now = performance.now();
      if (pausedAt !== null) timeline.delay(now - pausedAt);
      pausedAt = null; paint(now);
    }
    refresh.current = update;
    update();
    return () => {
      disposed = true; revision++; cancelAnimationFrame(tick);
      leases.forEach(lease => lease.release()); leases.clear(); images.clear();
      refresh.current = null;
    };
  }, [manifest]);
  return <span className={styles.character} data-engine="natural-frames" data-character-version={manifest.version} aria-hidden="true">
    <span ref={fallback}><Image className={styles.fallbackCharacter} src={manifest.still.src} width={manifest.width} height={manifest.height} alt="" unoptimized loading="eager" /></span>
    <canvas ref={canvas} className={styles.spriteSheet} width={manifest.width} height={manifest.height} />
  </span>;
}
