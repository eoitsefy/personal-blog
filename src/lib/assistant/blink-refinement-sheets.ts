import { LEFT_COLLAR_SHEETS } from "./left-collar-sheets";

// Historical releases stay immutable. This override changes only the idle atlas
// and restores the previously omitted reopening sample 49.
export const BLINK_SOURCE_INDICES = [...new Set([
  ...Array.from({ length: 61 }, (_, i) => i * 2), 37, 39, 41, 43, 45, 47, 49,
])].sort((a, b) => a - b);
export const BLINK_DRAWING_TIMES = BLINK_SOURCE_INDICES.map(i => Math.min(i, 119) * 1000 / 30);
export const BLINK_REFINEMENT_SHEETS = {
  "pilot-blink": {
    ...LEFT_COLLAR_SHEETS["pilot-blink"],
    src: "/assistant/chibi-idle-blink-refined-v1.webp",
    poses: BLINK_SOURCE_INDICES.map((_, i) => {
      const x = i % 6 * 366, y = Math.floor(i / 6) * 460;
      return [x, y, x + 365, y + 459, x + 204, y + 455] as const;
    }),
  },
} as const;
