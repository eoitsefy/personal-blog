import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppearance, NATURAL_IDLE } from "./appearance";
test("new accepted idle is default; explicit legacy choice is preserved", () => {
  for (const value of [null, undefined, "", "unknown", "natural"]) assert.equal(parseAppearance(value), "natural");
  assert.equal(parseAppearance("legacy"), "legacy");
});
test("animation and accessible static fallback use distinct versioned resources", () => {
  assert.notEqual(NATURAL_IDLE.animated, NATURAL_IDLE.still);
  assert.match(NATURAL_IDLE.animated, /^\/assistant\/chibi-natural-idle-v2\.webp$/);
  assert.equal(NATURAL_IDLE.size, 480);
});
