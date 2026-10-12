"use client";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { NATURAL_IDLE } from "@/lib/assistant/appearance";
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
export function NaturalIdleCharacter({ animate = true, active = true }: { animate?: boolean; active?: boolean }) {
  const available = useSyncExternalStore(subscribeMotion, motionAvailable, () => false);
  const [failed, setFailed] = useState(false);
  const moving = animate && active && available && !failed;
  // Keep the accepted canvas fixed. No CSS body movement or old-pose blending.
  // The static first frame also covers reduced motion, hidden tabs and failures.
  return <span className={styles.character} data-engine="natural-idle" data-character-version={NATURAL_IDLE.version} data-animated={moving} aria-hidden="true">
    <Image className={styles.fallbackCharacter} src={moving ? NATURAL_IDLE.animated : NATURAL_IDLE.still}
      width={NATURAL_IDLE.size} height={NATURAL_IDLE.size} alt="" unoptimized loading="eager"
      onError={() => setFailed(true)} />
  </span>;
}
