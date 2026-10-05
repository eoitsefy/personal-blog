// Fixed whole-frame atlases. Blink keeps explicit v6 owner acceptance;
// the wave v16 atlas requires complete-frame approval before it can be exported.
type Rect = readonly [number, number, number, number, number, number];
function poses(count: number, columns: number): Rect[] {
  return Array.from({ length: count }, (_, i) => {
    const x = i % columns * 366, y = Math.floor(i / columns) * 460;
    return [x, y, x + 365, y + 459, x + 204, y + 455];
  });
}
const scale = 0.553763440860215 / 1.2;
export const PILOT_SHEETS = {
  "pilot-blink": { src: "/assistant/chibi-blink-pilot-v6.webp", width: 1098, height: 1380, scale, poses: poses(9, 3) },
  "pilot-wave": { src: "/assistant/chibi-wave-reviewed-v16.webp", width: 2196, height: 3220, scale, poses: poses(37, 6) },
} as const;
