"use client";
import { useEffect, useRef } from "react";
import { SLEEP_ART_VERSION, SLEEP_FPS, SLEEP_LOOP, SLEEP_SHEETS } from "@/lib/assistant/sleep-sheets";
import type { PresencePhase } from "@/lib/assistant/presence";
import styles from "./assistant-panel.module.css";
type ScenePhase = Extract<PresencePhase, "entering" | "sleeping" | "waking">;
export function SleepScene({ phase, cycle, animate, onFinished, onFailed }: {
  phase: ScenePhase; cycle: number; animate: boolean; onFinished: (cycle: number) => void; onFailed: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onFinished, onFailed });
  useEffect(() => { callbacks.current = { onFinished, onFailed }; }, [onFinished, onFailed]);
  useEffect(() => {
    const element = canvas.current!, context = element.getContext("2d");
    if (!context) { callbacks.current.onFailed(); return; }
    const source = phase === "waking" ? "wake" : "enter", config = SLEEP_SHEETS[source];
    const sequence: readonly number[] = phase === "sleeping" ? SLEEP_LOOP : Array.from({ length: config.frames }, (_, i) => i);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const images = new Map<number, HTMLImageElement>(), loading = new Map<number, Promise<HTMLImageElement>>();
    let disposed = false, raf = 0, clock: Animation | undefined, completed = false, stalled = false, activePage = -1, upcomingPage = -1;
    const allowed = () => animate && !reduced.matches && !document.hidden;
    function finish() { if (!completed && !disposed) { completed = true; callbacks.current.onFinished(cycle); } }
    function nextPage(position: number) {
      const current = Math.floor(sequence[position] / config.pageFrames);
      for (let n = 1; n <= sequence.length; n++) {
        const next = position + n;
        if (phase !== "sleeping" && next >= sequence.length) break;
        const page = Math.floor(sequence[next % sequence.length] / config.pageFrames);
        if (page !== current) return page;
      }
      return current;
    }
    function trim() {
      for (const [key, image] of images) if (key !== activePage && key !== upcomingPage) { image.src = ""; images.delete(key); }
      element.dataset.cachedPages = String(images.size);
    }
    async function load(page: number) {
      if (images.has(page)) return images.get(page)!;
      if (!loading.has(page)) {
        const pending = new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image(); image.decoding = "async";
          image.onload = () => resolve(image); image.onerror = () => reject(new Error("Sleep artwork unavailable"));
          image.src = config.pages[page].src;
        });
        loading.set(page, pending);
      }
      const image = await loading.get(page)!;
      if (!disposed) images.set(page, image);
      loading.delete(page); return image;
    }
    function paint(position: number) {
      const index = sequence[position], page = Math.floor(index / config.pageFrames), image = images.get(page);
      activePage = page; upcomingPage = nextPage(position); trim();
      if (!image) return false;
      const local = index % config.pageFrames;
      context!.clearRect(0, 0, element.width, element.height); context!.imageSmoothingQuality = "high";
      context!.drawImage(image, local % config.columns * config.tileWidth, Math.floor(local / config.columns) * config.tileHeight,
        config.tileWidth, config.tileHeight, 0, 0, element.width, element.height);
      element.dataset.sleepReady = "true"; element.dataset.sourceFrame = String(index); element.dataset.sequencePosition = String(position);
      void load(upcomingPage).then(() => { if (!disposed) trim(); }).catch(() => { if (!disposed) callbacks.current.onFailed(); });
      return true;
    }
    async function recover(position: number) {
      if (stalled) return;
      stalled = true; clock?.pause();
      try {
        await load(Math.floor(sequence[position] / config.pageFrames));
        if (disposed) return;
        paint(position); stalled = false;
        if (allowed()) clock?.play();
      } catch { if (!disposed) callbacks.current.onFailed(); }
    }
    function frame() {
      raf = 0;
      if (disposed) return;
      // A freshly created media query can update before its change event is
      // delivered. Settle the still pose here as well, rather than just stop.
      if (clock && !allowed()) { void refresh(); return; }
      if (clock && allowed()) {
        const time = Math.max(0, Number(clock.currentTime ?? 0));
        const position = Math.min(sequence.length - 1, Math.floor((phase === "sleeping" ? time % (sequence.length / SLEEP_FPS * 1000) : time) * SLEEP_FPS / 1000));
        if (!paint(position)) void recover(position);
        else if (phase !== "sleeping" && time >= sequence.length / SLEEP_FPS * 1000) finish();
      }
      if (allowed()) raf = requestAnimationFrame(frame);
    }
    async function refresh() {
      if (!clock || disposed) return;
      cancelAnimationFrame(raf); raf = 0;
      if (!animate || reduced.matches) {
        clock.pause();
        const position = phase === "sleeping" ? 0 : sequence.length - 1;
        try { await load(Math.floor(sequence[position] / config.pageFrames)); if (!disposed) { paint(position); if (phase !== "sleeping") finish(); } }
        catch { if (!disposed) callbacks.current.onFailed(); }
      } else if (document.hidden) clock.pause();
      else { if (!stalled) clock.play(); raf = requestAnimationFrame(frame); }
    }
    async function prepare() {
      try {
        const rect = element.getBoundingClientRect(), pixels = Math.max(1, Math.round(Math.min(2, devicePixelRatio) * rect.width));
        // Canvas persists across phases; only the first prepared pose replaces it.
        await load(Math.floor(sequence[0] / config.pageFrames));
        if (disposed) return;
        if (element.width !== pixels) element.width = element.height = pixels;
        paint(0);
        clock = element.animate([{ opacity: 1 }, { opacity: 1 }], { duration: sequence.length / SLEEP_FPS * 1000, iterations: phase === "sleeping" ? Infinity : 1, fill: "forwards" });
        clock.pause(); void refresh();
      } catch { if (!disposed) callbacks.current.onFailed(); }
    }
    void prepare();
    reduced.addEventListener("change", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; cancelAnimationFrame(raf); clock?.cancel(); images.clear(); loading.clear(); reduced.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [phase, cycle, animate]);
  return <canvas ref={canvas} className={styles.sleepScene} width={480} height={480} aria-hidden="true" data-sleep-art={SLEEP_ART_VERSION} data-sleep-phase={phase} />;
}
