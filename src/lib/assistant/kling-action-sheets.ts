// Original whole-figure samples, including recovery, at the provider's 24 fps.
// Shared fixed canvas and sole anchor; never re-centre individual frames.
export const KLING_ACTION_FPS = 24;
export const KLING_ACTION_COUNTS = {nod: 73, thinking: 73, cheer: 73, yawn: 97} as const;
function sheet(action: keyof typeof KLING_ACTION_COUNTS) {
  const count = KLING_ACTION_COUNTS[action];
  return {
    src: `/assistant/chibi-${action}-kling-v${action === "cheer" ? 2 : 1}.webp`,
    width: 1464, height: Math.ceil(count / 6) * 308,
    scale: (0.553763440860215 / 1.2) * 1.5,
    poses: Array.from({length: count}, (_, i) => {
      const x = i % 6 * 244, y = Math.floor(i / 6) * 308;
      return [x, y, x + 243, y + 307, x + 136, y + 305] as const;
    }),
  };
}
export const KLING_ACTION_SHEETS = {
  "kling-nod": sheet("nod"),
  "kling-thinking": sheet("thinking"),
  "kling-cheer": sheet("cheer"),
  "kling-yawn": sheet("yawn"),
} as const;
