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

export function characterKeyframes(action: CharacterAction) {
  const row = CHARACTER_ACTIONS[action].row;
  const offsets = action === "idle" ? [0, .86, .9, .93, .96, .98] : [0, .14, .28, .44, .62, .8];
  return [...offsets.map((offset, column) => ({ left: `${-column * 100}%`, top: `${-row * 100}%`, offset, easing: "steps(1, end)" })),
    { left: "0%", top: "0%", offset: 1, easing: "steps(1, end)" }];
}
