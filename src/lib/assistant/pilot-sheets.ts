// Fixed whole-frame atlas exported from owner-accepted v6 samples. Art defects
// remain recorded in docs/assistant/art-pilot-v6/review/visual.json.
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
  "pilot-wave": { src: "/assistant/chibi-wave-pilot-v6.webp", width: 2196, height: 2760, scale, poses: poses(31, 6) },
} as const;
