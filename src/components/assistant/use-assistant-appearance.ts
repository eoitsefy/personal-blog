"use client";
import { useSyncExternalStore } from "react";
import { APPEARANCE_STORAGE_KEY, parseAppearance, type AssistantAppearance } from "@/lib/assistant/appearance";

const changed = "blog-assistant-appearance-change";
let sessionChoice: AssistantAppearance | undefined;
function snapshot(): AssistantAppearance {
  if (sessionChoice) return sessionChoice;
  try { return parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY)); }
  catch { return "natural"; }
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
      sessionChoice = undefined; notify();
    }
  };
  window.addEventListener(changed, notify);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(changed, notify); window.removeEventListener("storage", storage); };
}
export function setAssistantAppearance(value: AssistantAppearance) {
  sessionChoice = parseAppearance(value);
  try { localStorage.setItem(APPEARANCE_STORAGE_KEY, sessionChoice); } catch { /* Session-only preference remains usable. */ }
  window.dispatchEvent(new Event(changed));
}
export function useAssistantAppearance() {
  return useSyncExternalStore(subscribe, snapshot, () => "natural" as const);
}
