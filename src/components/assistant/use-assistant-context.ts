"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BEHAVIOR_TIMING } from "@/lib/assistant/behavior";
import type { useAssistantBehavior } from "./use-assistant-behavior";

// Per-document greeting: route changes and visibility changes must not spam waves.
let greeted=false;
export function useAssistantContext(enabled:boolean,open:boolean,send:ReturnType<typeof useAssistantBehavior>["send"]) {
  const pathname=usePathname();
  useEffect(() => {
    if (!enabled || greeted) return;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    let timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=() => {
      clearTimeout(timer);
      if (document.hidden || reduced.matches || greeted) return;
      timer=setTimeout(() => { greeted=true; send({ type:"arrive" }); },BEHAVIOR_TIMING.arrivalDelay);
    };
    schedule(); document.addEventListener("visibilitychange",schedule); reduced.addEventListener("change",schedule);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange",schedule); reduced.removeEventListener("change",schedule); };
  },[enabled,send]);
  useEffect(() => {
    if (!enabled || open) return;
    let scrolled=false,used=false;
    const began=performance.now(),reduced=matchMedia("(prefers-reduced-motion: reduce)");
    let timer:ReturnType<typeof setTimeout>|undefined;
    const reading=() => {
      if (used || document.hidden || reduced.matches || !scrolled) return;
      if (performance.now()-began < BEHAVIOR_TIMING.readingDwell) return;
      used=true; send({ type:"reading" });
    };
    const scroll=() => {
      if (window.scrollY < 100) return;
      scrolled=true; clearTimeout(timer);
      timer=setTimeout(reading,Math.max(200,BEHAVIOR_TIMING.readingDwell-(performance.now()-began)));
    };
    window.addEventListener("scroll",scroll,{ passive:true });
    return () => { clearTimeout(timer); window.removeEventListener("scroll",scroll); };
  },[enabled,open,pathname,send]);
}
