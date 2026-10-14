import type { CharacterAction } from "./character";
import type { AssistantAnswer } from "./ui";

// Local UI policy only. No model calls, persisted questions or skin geometry.
export const BEHAVIOR_TIMING = {
  greetingCooldown: 60_000,
  responseCooldown: 8_000,
  socialCooldown: 6_000,
  thinkingDelay: 600,
  thinkingInterval: 12_000,
  idleDelay: 35_000,
  yawnCooldown: 90_000,
  arrivalDelay: 1_200,
  readingDwell: 12_000,
  readingCooldown: 45_000,
} as const;
export const ASSISTANT_BEHAVIOR_VERSION = "context-events-v2";

export type BehaviorState = {
  action: CharacterAction;
  playId: number;
  enabled: boolean;
  pending: boolean;
  lastActivityAt: number;
  lastGreetingAt: number;
  lastResponseAt: number;
  lastYawnAt: number;
  lastReadingAt: number;
  lastSocialAt: number;
  deferredSocial: CharacterAction | null;
  nextThinkingAt: number;
};
type ResponseSummary = Pick<AssistantAnswer, "mode" | "confidence" | "sources">;
export type BehaviorEvent = (
  | { type: "availability"; enabled: boolean }
  | { type: "arrive" | "reading" | "open" | "close" | "activity" | "clear" | "submit" | "error" | "tick" }
  | { type: "answer"; action: CharacterAction }
  | { type: "social"; action: CharacterAction }
  | { type: "finished"; playId: number }
) & { now: number };

export function createBehaviorState(now = 0): BehaviorState {
  return { action: "idle", playId: 0, enabled: false, pending: false,
    lastActivityAt: now, lastGreetingAt: -Infinity, lastResponseAt: -Infinity,
    lastYawnAt: -Infinity, lastReadingAt: -Infinity, lastSocialAt: -Infinity, deferredSocial:null, nextThinkingAt: Infinity };
}

export function responseAction(question: string, result: ResponseSummary): CharacterAction {
  // A nod must not imply that an error or an unsupported answer is reliable.
  if (result.mode === "no_evidence" || result.confidence === "low") return "idle";
  if (result.mode === "grounded") return result.sources.length ? "nod" : "idle";
  if (/谢谢|感谢|多谢|辛苦|\bthanks?\b|\bthank you\b/i.test(question)) return "bow";
  if (/太好了|太棒|真棒|好耶|很开心|好开心|\b(?:great|awesome|hooray)\b/i.test(question)) return "cheer";
  return "nod";
}

function cue(state: BehaviorState, action: CharacterAction): BehaviorState {
  if (action === "idle" && state.action === "idle") return state;
  return { ...state, action, playId: state.playId + 1 };
}

export function nextBehaviorDeadline(state: BehaviorState): number | null {
  if (!state.enabled || state.action !== "idle") return null;
  return state.pending ? state.nextThinkingAt :
    Math.max(state.lastActivityAt + BEHAVIOR_TIMING.idleDelay, state.lastYawnAt + BEHAVIOR_TIMING.yawnCooldown);
}

export function reduceBehavior(state: BehaviorState, event: BehaviorEvent): BehaviorState {
  const now = Math.max(state.lastActivityAt, Number.isFinite(event.now) ? event.now : state.lastActivityAt);
  switch (event.type) {
    case "availability": {
      if (state.enabled === event.enabled) return state;
      const deferred=event.enabled ? state.deferredSocial : null;
      return cue({ ...state, enabled: event.enabled, lastActivityAt: now,
        deferredSocial:null,lastSocialAt:deferred?now:state.lastSocialAt,
        nextThinkingAt: state.pending && event.enabled ? now + BEHAVIOR_TIMING.thinkingDelay : Infinity }, deferred??"idle");
    }
    case "arrive":
    case "open": {
      const next = { ...state, lastActivityAt: now };
      if (event.type === "arrive" && (state.pending || state.action !== "idle")) return state;
      return state.enabled && now - state.lastGreetingAt >= BEHAVIOR_TIMING.greetingCooldown ?
        cue({ ...next, lastGreetingAt: now }, "wave") : next;
    }
    case "reading":
      // Decorative acknowledgement of reading, not a claim about answer accuracy.
      return state.enabled && !state.pending && state.action === "idle" &&
        now - state.lastReadingAt >= BEHAVIOR_TIMING.readingCooldown ?
        cue({ ...state, lastReadingAt: now, lastActivityAt: now }, "nod") : state;
    case "social": {
      const next={ ...state,pending:false,lastActivityAt:now,nextThinkingAt:Infinity };
      if (!state.enabled) return {...next,deferredSocial:event.action};
      if (now-state.lastSocialAt < BEHAVIOR_TIMING.socialCooldown) return next;
      return cue({ ...next,lastSocialAt:now,deferredSocial:null },event.action);
    }
    case "close": {
      const next={ ...state,pending:false,lastActivityAt:now,nextThinkingAt:Infinity };
      // Closing the balloon must not swallow a gratitude/wave already queued at
      // the next native idle boundary. Thinking is cancelled, gestures finish.
      return state.action==="thinking" ? cue(next,"idle") : next;
    }
    case "clear":
    case "error":
      return cue({ ...state, pending: false, lastActivityAt: now, nextThinkingAt: Infinity, deferredSocial:null }, "idle");
    case "activity":
      return state.action === "yawn" ? cue({ ...state, lastActivityAt: now }, "idle") :
        { ...state, lastActivityAt: now };
    case "submit":
      return cue({ ...state, pending: true, lastActivityAt: now,
        nextThinkingAt: state.enabled ? now + BEHAVIOR_TIMING.thinkingDelay : Infinity }, "idle");
    case "answer": {
      const next = { ...state, pending: false, lastActivityAt: now, nextThinkingAt: Infinity };
      if (!state.enabled || event.action === "idle" || now - state.lastResponseAt < BEHAVIOR_TIMING.responseCooldown)
        return cue(next, "idle");
      return cue({ ...next, lastResponseAt: now }, event.action);
    }
    case "finished":
      return event.playId === state.playId ? cue(state, "idle") : state;
    case "tick": {
      const deadline = nextBehaviorDeadline(state);
      if (deadline === null || now < deadline) return state;
      if (state.pending) return cue({ ...state, nextThinkingAt: now + BEHAVIOR_TIMING.thinkingInterval }, "thinking");
      return cue({ ...state, lastYawnAt: now }, "yawn");
    }
  }
}
