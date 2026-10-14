import type { H3Clip } from "./h3-motion";

export const H3_REST_AFTER_MS = 120_000;
export const H3_SIP_AFTER_MS = 20_000;
export const H3_SCENES = {
  night: { enter: ["bed-pull", "bed-change", "headset-off", "bed-enter"], loop: "sleep-loop",
    leave: ["bed-wake", "headset-on", "bed-change-back", "bed-remove", "yawn"] },
  day: { enter: ["beach-props", "beach-change", "beach-sit"], loop: "beach-loop",
    leave: ["beach-stand", "beach-change-back", "beach-remove"] },
} as const;
export type H3Presence = { phase: "awake" | "entering" | "resting" | "leaving"; scene: "night" | "day";
  index: number; cycle: number; clip: H3Clip | null; enabled: boolean; lastActivityAt: number; wakeRequested: boolean };
export type H3PresenceEvent = ({ type: "availability"; enabled: boolean } | { type: "tick"; hour: number } |
  { type: "activity" | "click" | "failed" } | { type: "finished"; cycle: number }) & { now: number };
export const createH3Presence = (): H3Presence => ({ phase: "awake", scene: "night", index: 0, cycle: 0, clip: null,
  enabled: false, lastActivityAt: 0, wakeRequested: false });
export function h3PresenceDeadline(s: H3Presence) {
  if (!s.enabled) return null;
  if (s.phase === "awake") return s.lastActivityAt + H3_REST_AFTER_MS;
  if (s.phase === "resting" && s.scene === "day" && s.clip === "beach-loop") return s.lastActivityAt + H3_SIP_AFTER_MS;
  return null;
}
export function reduceH3Presence(s: H3Presence, e: H3PresenceEvent): H3Presence {
  const now = Math.max(s.lastActivityAt, e.now);
  const awake = () => ({ ...s, phase: "awake" as const, clip: null, cycle: s.cycle+1, lastActivityAt: now, wakeRequested: false });
  const leave = () => ({ ...s, phase: "leaving" as const, index: 0, clip: H3_SCENES[s.scene].leave[0], cycle: s.cycle+1, lastActivityAt: now });
  switch (e.type) {
    case "availability": return s.enabled === e.enabled ? s : { ...s, enabled: e.enabled, lastActivityAt: now };
    case "activity": return s.phase === "awake" ? { ...s, lastActivityAt: now } : s;
    case "failed": return awake();
    case "click":
      if (s.phase === "awake") return { ...s, lastActivityAt: now };
      if (s.phase === "entering") return { ...s, wakeRequested: true };
      return s.phase === "resting" ? leave() : s;
    case "tick": {
      const deadline = h3PresenceDeadline(s);
      if (deadline === null || now < deadline) return s;
      if (s.phase === "resting") return { ...s, clip: "coconut-sip", cycle: s.cycle+1, lastActivityAt: now };
      const scene = e.hour >= 20 || e.hour < 8 ? "night" : "day";
      return { ...s, phase: "entering", scene, index: 0, clip: H3_SCENES[scene].enter[0], cycle: s.cycle+1, lastActivityAt: now };
    }
    case "finished": {
      if (e.cycle !== s.cycle || s.phase === "awake") return s;
      if (s.phase === "resting") return s.clip === "coconut-sip" ? { ...s, clip: "beach-loop", cycle: s.cycle+1, lastActivityAt: now } : s;
      const sequence = H3_SCENES[s.scene][s.phase === "entering" ? "enter" : "leave"];
      if (s.index+1 < sequence.length) return { ...s, index: s.index+1, clip: sequence[s.index+1], cycle: s.cycle+1 };
      if (s.phase === "leaving") return awake();
      return s.wakeRequested ? leave() : { ...s, phase: "resting", clip: H3_SCENES[s.scene].loop, cycle: s.cycle+1, lastActivityAt: now };
    }
  }
}
