import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { parseAppearance } from "./appearance";

test("H3 entry cannot schedule or prefetch removed scenes, while both compatibility appearances remain", () => {
  const component = readFileSync("src/components/assistant/chibi-assistant.tsx", "utf8");
  for (const removed of ["useH3Presence", "nextH3SceneClip", "scene.state", "scene.send"]) assert(!component.includes(removed), removed);
  assert(component.includes("useAssistantPresence(animate && legacy"));
  assert.equal(parseAppearance("natural"), "natural"); assert.equal(parseAppearance("legacy"), "legacy");
  for (const path of ["src/lib/assistant/h3-presence.ts", "src/lib/assistant/h3-prefetch.ts", "src/components/assistant/use-h3-presence.ts"]) assert(!existsSync(path));
});

test("resource and mobile preview interfaces contain no old scene entry points or fallback release", () => {
  for (const path of ["src/components/admin/assistant-actions.tsx", "src/components/assistant/h3-mobile-preview.tsx"]) {
    const source = readFileSync(path, "utf8");
    for (const old of ["scenePreviewPlan", "bed-pull", "beach-props", "日间完整流程", "夜间完整流程", "h3-mobile-v1", "H3_LEGACY_MOTION"]) assert(!source.includes(old), path + old);
  }
  const character = readFileSync("src/components/assistant/h3-character.tsx", "utf8");
  assert(!character.includes("H3_LEGACY_MOTION")); assert(!character.includes("allowLocalCandidate"));
});
