// Reuse the owner-accepted bow-like trial as thanks, never nod confirmation.
// Remove only surplus neutral lead/tail; source frames 24..96 stay consecutive.
export const KLING_BOW_FPS = 24;
export const KLING_BOW_FRAME_COUNT = 73;
export const KLING_BOW_DRAWING_TIMES = Array.from({length: KLING_BOW_FRAME_COUNT}, (_, i) => i * 1000 / KLING_BOW_FPS);
export const KLING_BOW_SHEETS = {
  "kling-bow": {
    src: "/assistant/chibi-bow-kling-v1.webp",
    width: 1464, height: 4004,
    scale: (0.553763440860215 / 1.2) * 1.5,
    poses: Array.from({length: KLING_BOW_FRAME_COUNT}, (_, i) => {
      const x = i % 6 * 244, y = Math.floor(i / 6) * 308;
      return [x, y, x + 243, y + 307, x + 136, y + 305] as const;
    }),
  },
} as const;
