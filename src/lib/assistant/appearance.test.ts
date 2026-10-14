import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppearance, NATURAL_IDLE } from "./appearance";
test("H3 is the new default; both earlier appearances remain available", () => {
  for (const value of [null, undefined, "", "unknown", "h3"]) assert.equal(parseAppearance(value), "h3");
  assert.equal(parseAppearance("natural"), "natural");
  assert.equal(parseAppearance("legacy"), "legacy");
});
test("animation and accessible static fallback use distinct versioned resources", () => {
  assert.notEqual(NATURAL_IDLE.animated, NATURAL_IDLE.still);
  assert.match(NATURAL_IDLE.animated, /^\/assistant\/chibi-natural-idle-v2\.webp$/);
  assert.equal(NATURAL_IDLE.size, 480);
});
