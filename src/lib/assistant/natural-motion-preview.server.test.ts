import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { allowedMotionCandidate, DEFAULT_MOTION_CANDIDATE, readMotionCandidate, readMotionCandidateAsset } from "./natural-motion-preview.server";
import { validNaturalMotion, validNaturalRuntime } from "./natural-motion";
import { GET } from "../../app/api/dev/assistant-motion/[version]/[file]/route";

test("production preview denies both manifest and asset access without reading candidate files", async () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "production" });
  try {
    await assert.rejects(readMotionCandidate(), /unavailable/);
    await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, "anchor.webp"), /unavailable/);
    const response = await GET(new Request("http://localhost/api/dev/assistant-motion/x/anchor.webp"), { params: Promise.resolve({ version: "x", file: "anchor.webp" }) });
    assert.equal(response.status, 404);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test("candidate version and filenames cannot select arbitrary files", async () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    assert.equal(allowedMotionCandidate("../../"), false);
    await assert.rejects(readMotionCandidateAsset("../../", "anchor.webp"), /Unknown/);
    for (const name of ["../../.env", "manifest.json", "anchor.webp/../../secret", "\\anchor.webp", "unused.webp"])
      await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, name), /not allowed/);
    const remote = await GET(new Request("http://example.com/api/dev/assistant-motion/x/anchor.webp"), { params: Promise.resolve({ version: "x", file: "anchor.webp" }) });
    assert.equal(remote.status, 404);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test("PENDING candidate can use the real player without changing any review claims", async t => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const file = resolve("docs/assistant/cloud-motion-suite-v1/wave-atlas-candidate-v1/manifest.json");
    const before = await readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (before === null) { t.skip("Local candidate is intentionally not shipped in production source"); return; }
    const raw = JSON.parse(before);
    assert.equal(validNaturalRuntime(raw), true);
    assert.equal(validNaturalMotion(raw), false);
    const runtime = await readMotionCandidate("natural-cloud-wave-candidate-v1");
    assert.equal("review" in runtime, false);
    assert.match(runtime.still.src, /^\/api\/dev\/assistant-motion\/natural-cloud-wave-candidate-v1\/anchor\.webp$/);
    const response = await GET(new Request(`http://localhost${runtime.still.src}`), { params: Promise.resolve({ version: "natural-cloud-wave-candidate-v1", file: "anchor.webp" }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    assert.equal(await readFile(file, "utf8"), before, "preview must not rewrite PENDING as PASS");
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test("development fault cases are fixed, action-only, and cannot bypass the asset whitelist", async t => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const runtime = await readMotionCandidate().catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!runtime) { t.skip("Local acceptance candidate not shipped"); return; }
    const asset = Object.values(runtime.assets).find(asset => /\/wave-\d+\.webp$/.test(asset.src))!;
    const file = asset.src.split("/").at(-1)!;
    const request = (name: string, test: string) => GET(new Request(`http://localhost/api/dev/assistant-motion/${runtime.version}/${name}?assetTest=${test}`),
      { params: Promise.resolve({ version: runtime.version, file: name }) });
    assert.equal((await request(file, "fail-wave")).status, 503);
    assert.equal((await request("anchor.webp", "fail-wave")).status, 200);
    assert.equal((await request("wave-999999.webp", "fail-wave")).status, 404);
    assert.equal((await request(file, "delay-999999")).status, 404);
    const start = performance.now();
    assert.equal((await request(file, "delay-1200")).status, 200);
    assert.ok(performance.now() - start >= 1150, "fixed delay must actually hold the action page");
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});
