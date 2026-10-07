"use client";

import { useCallback, useEffect, useReducer } from "react";
import { createBehaviorState, nextBehaviorDeadline, reduceBehavior, type BehaviorEvent } from "@/lib/assistant/behavior";

type InputEvent = BehaviorEvent extends infer E ? E extends BehaviorEvent ? Omit<E, "now"> : never : never;

export function useAssistantBehavior(animate: boolean) {
  const [state, dispatch] = useReducer(reduceBehavior, undefined, () => createBehaviorState());
  const send = useCallback((event: InputEvent) => dispatch({ ...event, now: performance.now() } as BehaviorEvent), []);
  const finished = useCallback((playId: number) => send({ type: "finished", playId }), [send]);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () => send({ type: "availability", enabled: animate && !reduced.matches && !document.hidden });
    refresh();
    reduced.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { reduced.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [animate, send]);

  useEffect(() => {
    const deadline = nextBehaviorDeadline(state);
    if (deadline === null) return;
    const timer = window.setTimeout(() => send({ type: "tick" }), Math.max(0, deadline - performance.now()));
    return () => window.clearTimeout(timer);
  }, [state, send]);

  return { state, send, finished };
}
