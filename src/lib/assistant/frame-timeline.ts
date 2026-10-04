import { CHARACTER_ACTIONS, CHARACTER_STAGE, type CharacterAction } from "./character";
import { MOTION_AUTHORING_FPS } from "./motion";
import { REGISTERED_SHEETS } from "./registered-sheets";

type Sheet = keyof typeof REGISTERED_SHEETS;
export type Drawing = { sheet: Sheet; frame: number };
export const NEUTRAL_DRAWING: Drawing = { sheet: "original", frame: 0 };
const range = (sheet: Sheet, first: number, last: number): Drawing[] =>
  Array.from({ length: last - first + 1 }, (_, i) => ({ sheet, frame: first + i }));
// Artist-drawn full figures, not layered pieces or repeated frames to pad counts.
// Start/end reuse the EXACT original neutral drawing. Discard the undersized
// thinking row and replace abrupt hand drops with the dedicated recovery sheets.
export const DRAWING_SEQUENCES: Record<CharacterAction, readonly Drawing[]> = {
  idle: [NEUTRAL_DRAWING, ...range("original", 1, 4), ...range("idle", 0, 2),
    ...range("original", 5, 7), ...range("idle", 3, 3),
    ...range("original", 8, 8), ...range("idle", 4, 4), ...range("original", 9, 9),
    ...range("idle", 5, 5), ...range("original", 10, 11), NEUTRAL_DRAWING],
  wave: [NEUTRAL_DRAWING, ...range("wave", 0, 14), NEUTRAL_DRAWING],
  nod: [NEUTRAL_DRAWING, ...range("nod", 0, 11), NEUTRAL_DRAWING],
  thinking: [NEUTRAL_DRAWING, ...range("thinking", 0, 13), ...range("thinking-recovery", 0, 11), NEUTRAL_DRAWING],
  bow: [NEUTRAL_DRAWING, ...range("bow", 0, 17), NEUTRAL_DRAWING],
  cheer: [NEUTRAL_DRAWING, ...range("cheer", 0, 14), NEUTRAL_DRAWING],
  yawn: [NEUTRAL_DRAWING, ...range("yawn", 0, 19), ...range("yawn-recovery", 0, 11), NEUTRAL_DRAWING],
};
export const FRAME_INTERVAL_MS = 1000 / MOTION_AUTHORING_FPS;
export const FRAME_BLEND_MS = 24;
export function drawingKey(drawing: Drawing) { return `${drawing.sheet}:${drawing.frame}`; }
export function drawingPose(drawing: Drawing) {
  const sheet = REGISTERED_SHEETS[drawing.sheet];
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
  // Neutral resting holds are intentional, not counted as newly drawn poses.
  return DRAWING_SEQUENCES[action].map((_, index) => index === 0 ? 0 :
    action === "idle" ? 4800 + (index - 1) * FRAME_INTERVAL_MS : index * FRAME_INTERVAL_MS);
}
export function drawingSample(action: CharacterAction, elapsed: number) {
  const config = CHARACTER_ACTIONS[action], sequence = DRAWING_SEQUENCES[action];
  const time = config.loop ? Math.max(0, elapsed) % config.duration : Math.min(config.duration, Math.max(0, elapsed));
  if (!config.loop && time === config.duration) return { from: NEUTRAL_DRAWING, to: NEUTRAL_DRAWING, mix: 1 };
  const times = drawingTimes(action), step = Math.max(0, times.findLastIndex(at => time >= at));
  if (step === 0) return { from: sequence[0], to: sequence[0], mix: 1 };
  const progress = Math.min(1, (time - times[step]) / FRAME_BLEND_MS);
  return { from: sequence[step - 1], to: sequence[step], mix: progress * progress * (3 - 2 * progress) };
}
