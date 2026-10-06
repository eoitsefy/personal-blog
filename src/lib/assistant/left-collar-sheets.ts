import { REGISTERED_SHEETS } from "./registered-sheets";
import { PILOT_SHEETS } from "./pilot-sheets";

export const IDLE_SOURCE_INDICES = [...new Set([
  ...Array.from({ length: 61 }, (_, i) => i * 2), 37, 39, 41, 43, 45, 47,
])].sort((a, b) => a - b);
export const IDLE_DRAWING_TIMES = IDLE_SOURCE_INDICES.map(i => Math.min(i, 119) * 1000 / 30);
const poses = Array.from({ length: 67 }, (_, i) => {
  const x = i % 6 * 366, y = Math.floor(i / 6) * 460;
  return [x, y, x + 365, y + 459, x + 204, y + 455] as const;
});
export const LEFT_COLLAR_SHEETS = {
  "pilot-blink": { ...PILOT_SHEETS["pilot-blink"], src: "/assistant/chibi-idle-left-collar-v4.webp", width: 2196, height: 5520, poses },
  "pilot-wave": { ...PILOT_SHEETS["pilot-wave"], src: "/assistant/chibi-pilot-wave-left-collar-v5.webp" },
  nod: { ...REGISTERED_SHEETS.nod, src: "/assistant/chibi-nod-left-collar-v5.webp" },
  thinking: { ...REGISTERED_SHEETS.thinking, src: "/assistant/chibi-thinking-left-collar-v5.webp" },
  "thinking-recovery": { ...REGISTERED_SHEETS["thinking-recovery"], src: "/assistant/chibi-thinking-recovery-left-collar-v5.webp" },
  bow: { ...REGISTERED_SHEETS.bow, src: "/assistant/chibi-bow-left-collar-v5.webp" },
  cheer: { ...REGISTERED_SHEETS.cheer, src: "/assistant/chibi-cheer-left-collar-v5.webp" },
  yawn: { ...REGISTERED_SHEETS.yawn, src: "/assistant/chibi-yawn-left-collar-v5.webp" },
  "yawn-recovery": { ...REGISTERED_SHEETS["yawn-recovery"], src: "/assistant/chibi-yawn-recovery-left-collar-v5.webp" },
} as const;
