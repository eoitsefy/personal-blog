import { CHARACTER_ACTIONS, CHARACTER_STAGE, type CharacterAction } from "./character";
import { MOTION_AUTHORING_FPS } from "./motion";
import { REGISTERED_SHEETS } from "./registered-sheets";
import { PILOT_SHEETS } from "./pilot-sheets";
import { LEFT_COLLAR_SHEETS } from "./left-collar-sheets";
import { BLINK_REFINEMENT_SHEETS, BLINK_DRAWING_TIMES } from "./blink-refinement-sheets";
import { KLING_WAVE_SHEETS, KLING_WAVE_FPS, KLING_WAVE_FRAME_COUNT, KLING_WAVE_DRAWING_TIMES } from "./kling-wave-sheets";
import { KLING_BOW_SHEETS, KLING_BOW_FPS, KLING_BOW_FRAME_COUNT, KLING_BOW_DRAWING_TIMES } from "./kling-bow-sheets";
import { KLING_ACTION_SHEETS, KLING_ACTION_COUNTS, KLING_ACTION_FPS } from "./kling-action-sheets";

export const RUNTIME_SHEETS = { ...REGISTERED_SHEETS, ...PILOT_SHEETS, ...LEFT_COLLAR_SHEETS, ...BLINK_REFINEMENT_SHEETS, ...KLING_WAVE_SHEETS, ...KLING_BOW_SHEETS, ...KLING_ACTION_SHEETS };
export const CHARACTER_FRAME_VERSION = "original-left-collar-kling-actions-v2";
type Sheet = keyof typeof RUNTIME_SHEETS;
export type Drawing = { sheet: Sheet; frame: number };
export const NEUTRAL_DRAWING: Drawing = { sheet: "pilot-blink", frame: 0 };
const range = (sheet: Sheet, first: number, last: number): Drawing[] =>
  Array.from({ length: last - first + 1 }, (_, i) => ({ sheet, frame: first + i }));
// Whole figures: native torso exports with an eye-only contour finish. Breath
// uses 15 fps, with 30 fps blink samples; owner-accepted video gestures use
// 24 fps without geometric blends or limb compositing. Historical legacy
// resources stay archived; only the active timelines use the new samples.
// Every action starts/ends on the exact same canonical original-derived neutral.
export const DRAWING_SEQUENCES: Record<CharacterAction, readonly Drawing[]> = {
  idle: [NEUTRAL_DRAWING, ...range("pilot-blink", 1, 66), NEUTRAL_DRAWING],
  wave: [NEUTRAL_DRAWING, ...range("kling-wave", 1, KLING_WAVE_FRAME_COUNT - 2), NEUTRAL_DRAWING],
  nod: [NEUTRAL_DRAWING, ...range("kling-nod", 1, KLING_ACTION_COUNTS.nod - 2), NEUTRAL_DRAWING],
  thinking: [NEUTRAL_DRAWING, ...range("kling-thinking", 1, KLING_ACTION_COUNTS.thinking - 2), NEUTRAL_DRAWING],
  bow: [NEUTRAL_DRAWING, ...range("kling-bow", 1, KLING_BOW_FRAME_COUNT - 2), NEUTRAL_DRAWING],
  cheer: [NEUTRAL_DRAWING, ...range("kling-cheer", 1, KLING_ACTION_COUNTS.cheer - 2), NEUTRAL_DRAWING],
  yawn: [NEUTRAL_DRAWING, ...range("kling-yawn", 1, KLING_ACTION_COUNTS.yawn - 2), NEUTRAL_DRAWING],
};
export const FRAME_INTERVAL_MS = 1000 / MOTION_AUTHORING_FPS;
export const FRAME_BLEND_MS = 24;
export const isPilotAction = (action: CharacterAction) => action in DRAWING_SEQUENCES;
export const drawingDuration = (action: CharacterAction) => action === "idle" ? 4000 : action === "wave" ? KLING_WAVE_FRAME_COUNT / KLING_WAVE_FPS * 1000 : action === "bow" ? KLING_BOW_FRAME_COUNT / KLING_BOW_FPS * 1000 : KLING_ACTION_COUNTS[action] / KLING_ACTION_FPS * 1000;
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
  if (action === "wave") return KLING_WAVE_DRAWING_TIMES;
  if (action === "bow") return KLING_BOW_DRAWING_TIMES;
  return DRAWING_SEQUENCES[action].map((_, index) => index * 1000 / KLING_ACTION_FPS);
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
