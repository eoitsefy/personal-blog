export const MUSIC_EFFECT_PRESETS = [
  { id: "glow", label: "金色呼吸" },
  { id: "stars", label: "星轨留声" },
  { id: "spectrum", label: "页边音律" },
  { id: "companion", label: "助手共鸣" },
] as const;

export type MusicEffectPreset = typeof MUSIC_EFFECT_PRESETS[number]["id"];

export function isMusicEffectPreset(value: unknown): value is MusicEffectPreset {
  return MUSIC_EFFECT_PRESETS.some(preset => preset.id === value);
}
