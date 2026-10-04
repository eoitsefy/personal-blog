// Versioned artwork and timelines are the only character-specific configuration.
export const CHARACTER_ATLAS = { src: "/assistant/chibi-actions-v3.png", width: 1254, height: 1254, columns: 6, rows: 6 } as const;
export const CHARACTER_ACTIONS = {
  idle: { label: "待机", row: 0, duration: 6000, loop: true },
  wave: { label: "挥手", row: 1, duration: 1800, loop: false },
  nod: { label: "点头", row: 2, duration: 1500, loop: false },
  thinking: { label: "思考", row: 3, duration: 2400, loop: true },
  bow: { label: "鞠躬", row: 4, duration: 2000, loop: false },
  cheer: { label: "开心", row: 5, duration: 1800, loop: false },
} as const;
export type CharacterAction = keyof typeof CHARACTER_ACTIONS;
export const PLAYFUL_ACTIONS: CharacterAction[] = ["wave", "nod", "thinking", "bow", "cheer"];

// Generated figures are not registered to an exact grid. Measured rectangles
// isolate each pose; boot-centre anchors correct drift inside a fixed viewport.
export const CHARACTER_STAGE = { size: 224, centre: 112, baseline: 216, blendMs: 110 } as const;
export const CHARACTER_POSES = [
  [[63,7,186,211,125.8],[268,7,392,212,331.1],[469,7,594,212,533.1],[669,7,792,212,731.8],[872,7,995,212,935.3],[1074,7,1198,212,1136.4]],
  [[62,216,186,421,125.5],[268,216,392,421,331.5],[469,216,594,421,534.4],[670,216,794,421,734.3],[871,216,996,421,937.2],[1074,216,1198,421,1136.7]],
  [[63,425,186,629,125.4],[270,430,392,629,331.1],[470,430,594,629,533],[671,430,795,629,732.6],[872,426,996,629,935.4],[1075,425,1198,629,1136.8]],
  [[63,634,186,838,125.3],[268,633,393,837,332.9],[469,634,593,838,537.2],[667,634,792,838,738.8],[875,634,1000,838,942],[1075,634,1198,838,1137.3]],
  [[63,843,186,1046,125.5],[269,839,391,1046,333.9],[471,846,595,1046,537.3],[668,848,794,1046,739.6],[873,841,996,1046,940.8],[1075,843,1198,1046,1136.3]],
  [[63,1049,186,1251,125],[268,1050,392,1251,331.4],[470,1049,594,1251,534],[670,1049,798,1251,733.9],[872,1049,995,1251,934.8],[1074,1050,1198,1252,1135.8]],
] as const;

export function characterPose(index: number) {
  const [x, y, right, bottom, anchor] = CHARACTER_POSES[Math.floor(index / 6)][index % 6];
  return { x, y, width: right - x + 1, height: bottom - y + 1,
    left: CHARACTER_STAGE.centre - (anchor - x), top: CHARACTER_STAGE.baseline - (bottom - y + 1) };
}

export function characterSample(action: CharacterAction, elapsed: number) {
  const config = CHARACTER_ACTIONS[action];
  const time = config.loop ? Math.max(0, elapsed) % config.duration : Math.min(config.duration, Math.max(0, elapsed));
  const offsets = action === "idle" ? [0, .86, .9, .93, .96, .98, 1 - CHARACTER_STAGE.blendMs / config.duration] : [0, .14, .28, .44, .62, .8, 1 - CHARACTER_STAGE.blendMs / config.duration];
  if (!config.loop && time === config.duration) return { from: 0, to: 0, mix: 1 };
  const sequence = offsets.map((_, column) => column === 6 ? 0 : config.row * 6 + column);
  const step = Math.max(0, offsets.findLastIndex(offset => time >= offset * config.duration));
  if (step === 0) return { from: sequence[0], to: sequence[0], mix: 1 };
  const transition = Math.min(CHARACTER_STAGE.blendMs, (offsets[step] - offsets[step - 1]) * config.duration);
  const progress = Math.min(1, (time - offsets[step] * config.duration) / transition);
  return { from: sequence[step - 1], to: sequence[step], mix: progress * progress * (3 - 2 * progress) };
}
