import { CHARACTER_ACTIONS, CHARACTER_STAGE, type CharacterAction } from "./character";
import { MOTION_AUTHORING_FPS } from "./motion";
import { REGISTERED_SHEETS } from "./registered-sheets";
import { PILOT_SHEETS } from "./pilot-sheets";
import { LEFT_COLLAR_SHEETS } from "./left-collar-sheets";
import { BLINK_REFINEMENT_SHEETS, BLINK_DRAWING_TIMES } from "./blink-refinement-sheets";

export const RUNTIME_SHEETS = { ...REGISTERED_SHEETS, ...PILOT_SHEETS, ...LEFT_COLLAR_SHEETS, ...BLINK_REFINEMENT_SHEETS };
export const CHARACTER_FRAME_VERSION = "original-left-collar-blink-refined-v1";
type Sheet = keyof typeof RUNTIME_SHEETS;
export type Drawing = { sheet: Sheet; frame: number };
export const NEUTRAL_DRAWING: Drawing = { sheet: "pilot-blink", frame: 0 };
const range = (sheet: Sheet, first: number, last: number): Drawing[] =>
  Array.from({ length: last - first + 1 }, (_, i) => ({ sheet, frame: first + i }));
// Whole figures: native torso exports with an eye-only contour finish. Breath
// uses 15 fps, with 30 fps samples around the blink. Legacy actions only gain
// the left-collar accessory; their original art history is not re-approved.
// Every action starts/ends on the exact same canonical original-derived neutral.
export const DRAWING_SEQUENCES: Record<CharacterAction, readonly Drawing[]> = {
  idle: [NEUTRAL_DRAWING, ...range("pilot-blink", 1, 66), NEUTRAL_DRAWING],
  wave: [NEUTRAL_DRAWING, ...range("pilot-wave", 1, 35), NEUTRAL_DRAWING],
  nod: [NEUTRAL_DRAWING, ...range("nod", 0, 11), NEUTRAL_DRAWING],
  thinking: [NEUTRAL_DRAWING, ...range("thinking", 0, 13), ...range("thinking-recovery", 0, 11), NEUTRAL_DRAWING],
  bow: [NEUTRAL_DRAWING, ...range("bow", 0, 17), NEUTRAL_DRAWING],
  cheer: [NEUTRAL_DRAWING, ...range("cheer", 0, 14), NEUTRAL_DRAWING],
  yawn: [NEUTRAL_DRAWING, ...range("yawn", 0, 19), ...range("yawn-recovery", 0, 11), NEUTRAL_DRAWING],
};
export const FRAME_INTERVAL_MS = 1000 / MOTION_AUTHORING_FPS;
export const FRAME_BLEND_MS = 24;
export const isPilotAction = (action: CharacterAction) => action === "idle" || action === "wave";
export const drawingDuration = (action: CharacterAction) => action === "idle" ? 4000 : action === "wave" ? 3000 : CHARACTER_ACTIONS[action].duration;
export function drawingKey(drawing: Drawing) { return `${drawing.sheet}:${drawing.frame}`; }
export function drawingPose(drawing: Drawing) {
  const sheet = RUNTIME_SHEETS[drawing.sheet];
  const rect = sheet.poses[drawing.frame];
  if (!rect) throw new Error("Unregistered character drawing");
  const [x, y, right, bottom, anchorX, anchorY] = rect;
  const width = right - x + 1, height = bottom - y + 1;
  return { src: sheet.src, x, y, width, height, scale: sheet.scale,
    left: CHARACTER_STAGE.centre - (anchorX - x) * sheet.scale,
    top: CHARACTER_STAGE.baseline - (anchorY - y) * sheet.scale,
    drawWidth: width * sheet.scale, drawHeight: height * sheet.scale };
}
export function drawingTimes(action: CharacterAction) {
  if (action === "idle") return BLINK_DRAWING_TIMES;
  // Neutral resting holds are intentional, not counted as newly drawn poses.
  return DRAWING_SEQUENCES[action].map((_, index) => index === 0 ? 0 :
    index * FRAME_INTERVAL_MS);
}
export function drawingSample(action: CharacterAction, elapsed: number) {
  const config = CHARACTER_ACTIONS[action], sequence = DRAWING_SEQUENCES[action];
  const duration = drawingDuration(action);
  const time = config.loop ? Math.max(0, elapsed) % duration : Math.min(duration, Math.max(0, elapsed));
  if (!config.loop && time === duration) return { from: NEUTRAL_DRAWING, to: NEUTRAL_DRAWING, mix: 1 };
  const times = drawingTimes(action), step = Math.max(0, times.findLastIndex(at => time >= at));
  if (step === 0) return { from: sequence[0], to: sequence[0], mix: 1 };
  if (isPilotAction(action)) return { from: sequence[step], to: sequence[step], mix: 1 };
  const progress = Math.min(1, (time - times[step]) / FRAME_BLEND_MS);
  return { from: sequence[step - 1], to: sequence[step], mix: progress * progress * (3 - 2 * progress) };
}
