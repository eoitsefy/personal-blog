"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, useMemo } from "react";
import { H3_MOTION, H3_LEGACY_MOTION, H3_MOBILE_MOTION, validH3CandidateRuntime, validH3Motion, type H3Clip, type H3Manifest } from "@/lib/assistant/h3-motion";
import { H3PageCache, H3Player, loadH3Image } from "@/lib/assistant/h3-player";
import { getH3ResourceSnapshot, getH3ServerResourceSnapshot, subscribeH3Resource } from "@/lib/assistant/h3-resource-selection";
import styles from "./assistant-panel.module.css";

const desktopAvailable = validH3Motion(H3_MOTION);
const desktopMotion = desktopAvailable ? H3_MOTION : H3_LEGACY_MOTION;
const mobileAvailable = desktopAvailable && validH3Motion(H3_MOBILE_MOTION);
const pages = new H3PageCache<HTMLImageElement>(undefined, undefined, image => { image.src = ""; });
type Props = {
  clip: H3Clip; playId: number; animate: boolean; once?: boolean; nextClip?: H3Clip;
  onFinished: (id: number) => void; onFailed: () => void;
  manifest?: H3Manifest; allowLocalCandidate?: boolean;
};
export function H3Character(props: Props) {
  const candidate = props.manifest ?? desktopMotion;
  // Explicit preview candidates never relax the approved production release gate.
  const manifest = useMemo(() => validH3Motion(candidate) || (props.allowLocalCandidate && validH3CandidateRuntime(candidate)) ? candidate : desktopMotion, [candidate, props.allowLocalCandidate]);
  const preference = useSyncExternalStore(subscribeH3Resource, getH3ResourceSnapshot, getH3ServerResourceSnapshot);
  const wanted = !props.manifest && preference === "mobile" && mobileAvailable ? H3_MOBILE_MOTION : manifest;
  const [displayed, setDisplayed] = useState(manifest);
  const target = useRef(wanted), shown = useRef(manifest);
  const canvas = useRef<HTMLCanvasElement>(null), fallback = useRef<HTMLSpanElement>(null);
  const controls = useRef(props), refresh = useRef<(() => void) | null>(null);
  useEffect(() => { controls.current = props; target.current = wanted; }, [props, wanted]);
  useEffect(() => { refresh.current?.(); }, [props.clip, props.playId, props.animate, props.once, props.nextClip, wanted]);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext("2d");
    if (!element || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    element.style.visibility = "hidden"; delete element.dataset.failed; delete element.dataset.ready;
    if (fallback.current) fallback.current.style.visibility = "visible";
    const player = new H3Player(manifest, pages, {
      now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
      load: loadH3Image,
      paint: (image, sample, activeManifest) => {
        if (element.width !== activeManifest.width || element.height !== activeManifest.height) {
          element.width = activeManifest.width; element.height = activeManifest.height;
        }
        if (shown.current !== activeManifest) { shown.current = activeManifest; setDisplayed(activeManifest); }
        context.clearRect(0, 0, activeManifest.width, activeManifest.height);
        context.drawImage(image, sample.x, sample.y, activeManifest.width, activeManifest.height, 0, 0, activeManifest.width, activeManifest.height);
        element.style.visibility = "visible";
        if (fallback.current) fallback.current.style.visibility = "hidden";
        element.dataset.ready = "true"; element.dataset.clip = sample.clip; element.dataset.frame = String(sample.frame);
        element.dataset.decodedPixels = String(pages.pixels); element.dataset.decodedPages = String(pages.size);
      },
      onFinished: id => controls.current.onFinished(id),
      onFailed: () => {
        element.dataset.failed = "true"; element.style.visibility = "hidden";
        if (fallback.current) fallback.current.style.visibility = "visible";
        controls.current.onFailed();
      },
    });
    function update() {
      const c = controls.current;
      player.requestManifest(target.current);
      player.update({ clip: c.clip, playId: c.playId, once: c.once, nextClip: c.nextClip, animate: c.animate && !reduced.matches && !document.hidden });
    }
    if (!controls.current.manifest && mobileAvailable) target.current = getH3ResourceSnapshot() === "mobile" ? H3_MOBILE_MOTION : manifest;
    refresh.current = update; update();
    reduced.addEventListener("change", update); document.addEventListener("visibilitychange", update);
    return () => {
      player.dispose(); reduced.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); refresh.current = null;
    };
  }, [manifest]);
  return <span className={styles.character} data-engine="h3-native-frames" data-character-version={displayed.version} aria-hidden="true">
    <span ref={fallback}><Image className={styles.fallbackCharacter} src={displayed.stills[props.clip].src} width={displayed.width} height={displayed.height} alt="" unoptimized loading="eager" /></span>
    <canvas ref={canvas} className={styles.spriteSheet} width={manifest.width} height={manifest.height} />
  </span>;
}
