"use client";
import { useCallback, useEffect, useReducer } from "react";
import { createPresenceState, nextPresenceDeadline, reducePresence, type PresenceEvent } from "@/lib/assistant/presence";
type InputEvent = PresenceEvent extends infer E ? E extends PresenceEvent ? Omit<E, "now"> : never : never;
export function useAssistantPresence(animate: boolean, dialogOpen: boolean) {
  const [state, dispatch] = useReducer(reducePresence, undefined, () => createPresenceState());
  const send = useCallback((event: InputEvent) => dispatch({ ...event, now: performance.now() } as PresenceEvent), []);
  const finished = useCallback((cycle: number) => send({ type: "finished", cycle }), [send]);
  const failed = useCallback(() => send({ type: "failed" }), [send]);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () => {
      send({ type: "availability", enabled: animate && !dialogOpen && !document.hidden && !reduced.matches });
      if (state.phase === "recovering" && (!animate || reduced.matches)) finished(state.cycle);
    };
    refresh(); reduced.addEventListener("change", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { reduced.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [animate, dialogOpen, send, finished, state.phase, state.cycle]);
  useEffect(() => {
    const deadline = nextPresenceDeadline(state);
    if (deadline === null) return;
    const timer = window.setTimeout(() => send({ type: "tick" }), Math.max(0, deadline - performance.now()));
    return () => window.clearTimeout(timer);
  }, [state, send]);
  return { state, send, finished, failed };
}
