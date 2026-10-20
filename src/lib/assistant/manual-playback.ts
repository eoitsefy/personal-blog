import type { CharacterAction } from "./character";

export const ANIMATION_CHOICES: ReadonlyArray<{ action: CharacterAction; label: string }> = [
  { action: "idle", label: "待机 · 眨眼" },
  { action: "wave", label: "挥手" },
  { action: "nod", label: "点头" },
  { action: "bow", label: "感谢" },
  { action: "thinking", label: "思考" },
  { action: "cheer", label: "开心" },
  { action: "yawn", label: "打哈欠" },
];

export type ManualPlayback = { request: { action: CharacterAction; playId: number } | null; nextId: number };
type ManualEvent = { type: "select"; action: CharacterAction } | { type: "finished"; playId: number } | { type: "automatic" };

export function createManualPlayback(): ManualPlayback {
  // Scene callbacks use negative ids; reserve a separate range for manual requests.
  return { request: null, nextId: 1_000_000 };
}

export function reduceManualPlayback(state: ManualPlayback, event: ManualEvent): ManualPlayback {
  if (event.type === "select") return { request: { action: event.action, playId: state.nextId }, nextId: state.nextId + 1 };
  if (event.type === "finished" && state.request?.playId !== event.playId) return state;
  return state.request ? { ...state, request: null } : state;
}
