export type AssistantAppearance = "h3" | "natural" | "legacy";
export const APPEARANCE_STORAGE_KEY = "blog-assistant-appearance-v2";
export const NATURAL_IDLE = {
  version: "natural-idle-v2",
  animated: "/assistant/chibi-natural-idle-v2.webp",
  still: "/assistant/chibi-natural-idle-v2-still.webp",
  size: 480,
} as const;
export function parseAppearance(value: unknown): AssistantAppearance {
  return value === "legacy" ? "legacy" : value === "natural" ? "natural" : "h3";
}
