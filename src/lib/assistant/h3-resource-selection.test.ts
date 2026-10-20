import { test } from "node:test";
import assert from "node:assert/strict";
import { selectH3Resource, getH3ServerResourceSnapshot, getH3ResourceSnapshot, subscribeH3Resource } from "./h3-resource-selection";

test("server and hydration default agree; any constrained-device hint selects smaller assets", () => {
  assert.equal(getH3ServerResourceSnapshot(), "desktop");
  assert.equal(getH3ResourceSnapshot(), "desktop");
  for (let mask = 0; mask < 8; mask++) assert.equal(selectH3Resource({ smallScreen: !!(mask & 1), coarsePointer: !!(mask & 2), saveData: !!(mask & 4) }), mask ? "mobile" : "desktop");
});

test("resize, pointer and saveData changes subscribe and clean up without polling", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const small = Object.assign(new EventTarget(), { matches: false }), coarse = Object.assign(new EventTarget(), { matches: false });
  const network = Object.assign(new EventTarget(), { saveData: false });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: (query: string) => query.includes("767") ? small : coarse } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { connection: network } });
  try {
    let changes = 0; const unsubscribe = subscribeH3Resource(() => { changes++; });
    assert.equal(getH3ResourceSnapshot(), "desktop");
    small.matches = true; small.dispatchEvent(new Event("change")); assert.equal(getH3ResourceSnapshot(), "mobile");
    small.matches = false; coarse.matches = true; coarse.dispatchEvent(new Event("change")); assert.equal(getH3ResourceSnapshot(), "mobile");
    coarse.matches = false; network.saveData = true; network.dispatchEvent(new Event("change")); assert.equal(getH3ResourceSnapshot(), "mobile");
    assert.equal(changes, 3); unsubscribe(); network.dispatchEvent(new Event("change")); assert.equal(changes, 3);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
});
