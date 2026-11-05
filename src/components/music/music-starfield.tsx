"use client";

import { useEffect, useRef } from "react";
import type { MusicEffectPreset } from "./music-effect-presets";
import styles from "./music-starfield.module.css";

type MusicStarfieldProps = {
  enabled: boolean;
  preset: MusicEffectPreset;
};

const FRAME_INTERVAL = 1000 / 30;

/** Optional decorative motion; it does not inspect or follow audio. */
export function MusicStarfield({ enabled, preset }: MusicStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      canvas.dataset.motionState = "unavailable";
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId: number | null = null;
    let width = 0;
    let height = 0;
    let edgeWidth = 100;
    let narrow = false;
    let lastDraw = 0;
    let elapsed = 0;
    let disposed = false;
    let glow: CanvasGradient | null = null;
    let glowRadius = 0;
    let anchor: { x: number; y: number; radius: number } | null = null;
    let lastAnchorMeasure = -Infinity;
    const color = "#b17a24";

    const clear = () => context.clearRect(0, 0, width, height);

    const drawStars = () => {
      const count = narrow ? 22 : 40;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineCap = "round";

      for (let side = 0; side < 2; side += 1) {
        context.save();
        context.beginPath();
        context.rect(side === 0 ? 0 : width - edgeWidth, 0, edgeWidth, height);
        context.clip();

        // A quiet curved orbit makes the movement visible between the stars.
        const direction = side === 0 ? 1 : -1;
        const edge = side === 0 ? 0 : width;
        context.globalAlpha = 0.22;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(edge + direction * edgeWidth * 0.26, -20);
        context.bezierCurveTo(
          edge + direction * edgeWidth * 1.15, height * 0.3,
          edge - direction * edgeWidth * 0.25, height * 0.7,
          edge + direction * edgeWidth * 0.72, height + 20,
        );
        context.stroke();

        for (let index = side; index < count; index += 2) {
          // Stable, dispersed seeds avoid allocation and random jumps per frame.
          const seed = (index * 0.61803398875) % 1;
          const phase = seed * Math.PI * 2;
          const speed = 21 + (index % 5) * 4;
          const progress = ((seed * (height + 90) - elapsed * speed) % (height + 90) + height + 90) % (height + 90);
          const y = progress - 45;
          const inset = 5 + seed * (edgeWidth - 10) + Math.sin(elapsed * 0.5 + phase) * (narrow ? 1.5 : 7);
          const x = side === 0 ? inset : width - inset;
          const shimmer = 0.85 + Math.sin(elapsed * 0.8 + phase) * 0.15;
          const opacity = (0.65 + (index % 4) * 0.1) * shimmer;
          const radius = (narrow ? 1.3 : 1.7) + (index % 3) * 0.35;
          const tail = (narrow ? 12 : 20) + (index % 4) * 5;

          context.globalAlpha = opacity * 0.65;
          context.lineWidth = narrow ? 1 : 1.3;
          context.beginPath();
          context.moveTo(x, y);
          context.quadraticCurveTo(x + Math.sin(phase) * 3, y + tail * 0.5, x + Math.sin(phase) * 5, y + tail);
          context.stroke();

          context.globalAlpha = opacity;
          context.fillStyle = color;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#ffe2a0";
          context.beginPath();
          context.arc(x, y, radius * 0.42, 0, Math.PI * 2);
          context.fill();
          if (index % 5 === 0) {
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(x - radius * 2, y);
            context.lineTo(x + radius * 2, y);
            context.moveTo(x, y - radius * 2);
            context.lineTo(x, y + radius * 2);
            context.stroke();
          }
        }

        context.restore();
      }
      context.globalAlpha = 1;
    };

    const drawGlow = () => {
      if (!glow) return;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 / 7);
      for (let side = 0; side < 2; side += 1) {
        const amount = side === 0 ? pulse : 1 - pulse;
        const x = side === 0 ? -glowRadius * 0.42 : width + glowRadius * 0.42;
        const y = height * (side === 0 ? 0.3 : 0.78);
        context.save();
        context.translate(x, y);
        const scale = 0.85 + amount * 0.24;
        context.scale(scale, scale);
        context.globalAlpha = 0.62 + amount * 0.38;
        context.fillStyle = glow;
        context.fillRect(-glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.globalAlpha = 0.16 + amount * 0.14;
        context.beginPath();
        context.arc(0, 0, glowRadius * 0.73, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
    };

    // This is decorative motion, not a measurement of the song's frequencies.
    const drawSpectrum = () => {
      const rows = 18;
      context.strokeStyle = color;
      context.lineCap = "round";
      for (let index = 0; index < rows; index += 1) {
        const value = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 2.9 + index * 0.73))
          + 0.25 * (0.5 + 0.5 * Math.sin(elapsed * 5.1 - index * 0.31));
        const length = 3 + value * (narrow ? 13 : 48);
        const y = 85 + index * Math.max(1, height - 210) / (rows - 1);
        context.globalAlpha = 0.55 + value * 0.35;
        context.lineWidth = narrow ? 2 : 2.6;
        context.beginPath();
        context.moveTo(5, y);
        context.lineTo(5 + length, y);
        context.moveTo(width - 5, y);
        context.lineTo(width - 5 - length, y);
        context.stroke();
      }
      context.globalAlpha = 0.65;
      context.lineWidth = 1.4;
      context.beginPath();
      for (let x = 0; x <= width; x += 5) {
        const y = height - 5 + Math.sin(x * 0.035 - elapsed * 2.5) * 2 * Math.sin(Math.PI * x / width);
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    };

    const drawCompanion = () => {
      // Measure at most once per second; never query layout for each frame.
      if (elapsed - lastAnchorMeasure >= 1) {
        lastAnchorMeasure = elapsed;
        const button = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"][title*="右键选择动作"]');
        const rect = button?.getBoundingClientRect();
        anchor = rect && rect.width > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.56, radius: Math.min(rect.width, rect.height) * 0.46 } : null;
        canvas.dataset.companionAnchor = anchor ? "assistant" : "unavailable";
      }
      if (!anchor) return;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1.6;
      for (let index = 0; index < 3; index += 1) {
        const phase = (elapsed / 4.8 + index / 3) % 1;
        context.globalAlpha = (1 - phase) * 0.65;
        context.beginPath();
        context.ellipse(anchor.x, anchor.y, anchor.radius * (0.7 + phase), anchor.radius * (0.58 + phase * 0.83), 0, 0, Math.PI * 2);
        context.stroke();
      }
      for (let index = 0; index < 6; index += 1) {
        const phase = elapsed * 0.38 + index * Math.PI / 3;
        const x = anchor.x + Math.cos(phase) * anchor.radius * 1.05;
        const y = anchor.y + Math.sin(phase) * anchor.radius * 0.92;
        context.globalAlpha = 0.8;
        context.beginPath();
        context.arc(x, y, narrow ? 1.8 : 2.3, 0, Math.PI * 2);
        context.fill();
      }
    };

    const draw = () => {
      clear();
      context.save();
      if (preset === "stars") drawStars();
      else if (preset === "glow") drawGlow();
      else if (preset === "spectrum") drawSpectrum();
      else drawCompanion();
      context.restore();
    };

    const tick = (timestamp: number) => {
      frameId = null;
      if (disposed) return;
      const delta = timestamp - lastDraw;
      if (lastDraw === 0 || delta >= FRAME_INTERVAL) {
        elapsed += lastDraw === 0 ? 0 : Math.min(delta, 100) / 1000;
        lastDraw = timestamp;
        draw();
      }
      frameId = window.requestAnimationFrame(tick);
    };

    const sync = () => {
      const state = !enabled
        ? "disabled"
        : document.hidden
            ? "hidden"
            : reducedMotion.matches
              ? "reduced-motion"
              : "running";
      const running = state === "running";
      canvas.dataset.active = String(running);
      canvas.dataset.motionState = state;
      canvas.dataset.pageHidden = String(document.hidden);
      canvas.dataset.reducedMotion = String(reducedMotion.matches);

      if (!running) {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        frameId = null;
        lastDraw = 0;
        clear();
      } else if (frameId === null) {
        lastDraw = 0;
        frameId = window.requestAnimationFrame(tick);
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      narrow = width <= 600;
      edgeWidth = narrow ? 20 : Math.min(120, Math.max(64, width * 0.075));
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.25));
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      glowRadius = narrow ? 145 : Math.min(380, width * 0.25, height * 0.5);
      glow = context.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
      glow.addColorStop(0, "rgba(210, 146, 34, 0.52)");
      glow.addColorStop(0.45, "rgba(220, 164, 57, 0.22)");
      glow.addColorStop(1, "rgba(220, 164, 57, 0)");
      lastAnchorMeasure = -Infinity;
      canvas.dataset.edgeWidth = String(edgeWidth);
      canvas.dataset.particleCount = String(preset === "stars" ? narrow ? 22 : 40 : preset === "companion" ? 6 : 0);
      canvas.dataset.pixelRatio = String(dpr);
      // Resizing resets the bitmap; the existing loop draws the next frame.
    };

    resize();
    sync();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);

    return () => {
      disposed = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = null;
      clear();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, [enabled, preset]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.starfield}
      aria-hidden="true"
      data-testid="music-starfield"
      data-active="false"
      data-enabled={String(enabled)}
      data-manual-ambience={String(enabled)}
      data-effect-preset={preset}
      data-motion-state="initializing"
    />
  );
}
