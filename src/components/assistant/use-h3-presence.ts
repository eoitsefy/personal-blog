"use client";
import { useCallback, useEffect, useReducer } from "react";
import { createH3Presence, h3PresenceDeadline, reduceH3Presence, type H3PresenceEvent } from "@/lib/assistant/h3-presence";
type Input = H3PresenceEvent extends infer E ? E extends H3PresenceEvent ? Omit<E,"now"> : never : never;
export function useH3Presence(animate: boolean, open: boolean) {
  const [state,dispatch] = useReducer(reduceH3Presence,undefined,createH3Presence);
  const send = useCallback((event: Input) => dispatch({ ...event,now:performance.now() } as H3PresenceEvent),[]);
  const finished = useCallback((id: number) => send({ type:"finished",cycle:-id }),[send]);
  const failed = useCallback(() => send({ type:"failed" }),[send]);
  useEffect(() => {
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      send({ type:"availability",enabled:animate && !open && !document.hidden && !reduced.matches });
    }
    update(); reduced.addEventListener("change",update); document.addEventListener("visibilitychange",update);
    return () => { reduced.removeEventListener("change",update); document.removeEventListener("visibilitychange",update); };
  },[animate,open,send]);
  useEffect(() => {
    const deadline=h3PresenceDeadline(state);
    if (deadline===null) return;
    const timer=setTimeout(() => send({ type:"tick",hour:new Date().getHours() }),Math.max(0,deadline-performance.now()));
    return () => clearTimeout(timer);
  },[state,send]);
  return { state,send,finished,failed };
}
