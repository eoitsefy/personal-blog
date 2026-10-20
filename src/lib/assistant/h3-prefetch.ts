import { H3_SCENES, type H3Presence } from "./h3-presence";
import type { H3Clip } from "./h3-motion";

/** Prepare only the next state already determined by the presence workflow. */
export function nextH3SceneClip(state: H3Presence): H3Clip | undefined {
  const scene = H3_SCENES[state.scene];
  if (state.phase === "entering") {
    return scene.enter[state.index + 1] ?? (state.wakeRequested ? scene.leave[0] : scene.loop);
  }
  if (state.phase === "leaving") return scene.leave[state.index + 1] ?? "idle-blink";
  if (state.phase === "resting" && state.clip === "coconut-sip") return "beach-loop";
  return undefined;
}
