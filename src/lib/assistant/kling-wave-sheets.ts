// Owner-accepted Video 3.0 wave. Source frames remain whole figures at native 24 fps.
// Uniform 2/3 asset scale bounds decoded wave memory to about 36 MiB.
export const KLING_WAVE_FPS = 24;
export const KLING_WAVE_FRAME_COUNT = 121;
export const KLING_WAVE_DRAWING_TIMES = Array.from({ length: KLING_WAVE_FRAME_COUNT }, (_, i) => i * 1000 / KLING_WAVE_FPS);
export const KLING_WAVE_SHEETS = {
  "kling-wave": {
    src: "/assistant/chibi-wave-kling-v2.webp",
    width: 1464, height: 6468,
    scale: (0.553763440860215 / 1.2) * 1.5,
    poses: Array.from({ length: KLING_WAVE_FRAME_COUNT }, (_, i) => {
      const x = i % 6 * 244, y = Math.floor(i / 6) * 308;
      // One fixed sole anchor for the ENTIRE clip, including codec edge padding.
      // Never re-centre individual frames (which would make the body slide).
      return [x, y, x + 243, y + 307, x + 136, y + 305] as const;
    }),
  },
} as const;
