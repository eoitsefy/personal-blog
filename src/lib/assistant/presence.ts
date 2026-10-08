// Independent of chat requests: sleeping never sends a model request.
export const SLEEP_AFTER_MS = 120_000;
export type PresencePhase = "awake" | "entering" | "sleeping" | "waking" | "recovering";
export type PresenceState = { phase: PresencePhase; cycle: number; enabled: boolean; lastActivityAt: number; wakeRequested: boolean };
export type PresenceEvent = (
  | { type: "availability"; enabled: boolean }
  | { type: "tick" | "click" | "failed" }
  | { type: "finished"; cycle: number }
) & { now: number };
export const createPresenceState = (now = 0): PresenceState => ({ phase: "awake", cycle: 0, enabled: false, lastActivityAt: now, wakeRequested: false });
export function nextPresenceDeadline(state: PresenceState): number | null {
  return state.enabled && state.phase === "awake" ? state.lastActivityAt + SLEEP_AFTER_MS : null;
}
function transition(state: PresenceState, phase: PresencePhase, now: number): PresenceState {
  return { ...state, phase, cycle: state.cycle + 1, lastActivityAt: now, wakeRequested: false };
}
export function reducePresence(state: PresenceState, event: PresenceEvent): PresenceState {
  const now = Math.max(state.lastActivityAt, Number.isFinite(event.now) ? event.now : state.lastActivityAt);
  switch (event.type) {
    case "availability":
      if (state.enabled === event.enabled) return state;
      // Sleep persists through a hidden tab; awake inactivity starts fresh.
      return { ...state, enabled: event.enabled, lastActivityAt: now };
    case "tick": {
      const deadline = nextPresenceDeadline(state);
      return deadline !== null && now >= deadline ? transition(state, "entering", now) : state;
    }
    case "click":
      if (state.phase === "awake") return { ...state, lastActivityAt: now };
      if (!state.enabled) return transition(state, "awake", now);
      if (state.phase === "entering") return { ...state, wakeRequested: true };
      return state.phase === "sleeping" ? transition(state, "waking", now) : state;
    case "failed":
      // A failed asset must never trap the launcher in a sleep-only state.
      return transition(state, "awake", now);
    case "finished":
      if (event.cycle !== state.cycle) return state;
      if (state.phase === "entering") return transition(state, state.wakeRequested ? "waking" : "sleeping", now);
      if (state.phase === "waking") return transition(state, state.enabled ? "recovering" : "awake", now);
      if (state.phase === "recovering") return transition(state, "awake", now);
      return state;
  }
}
