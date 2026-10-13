import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { allowedMotionCandidate, DEFAULT_MOTION_CANDIDATE, readMotionCandidate, readMotionCandidateAsset, validateMotionCandidateSources } from "./natural-motion-preview.server";
import { validNaturalMotion, validNaturalRuntime, type NaturalRuntimeManifest } from "./natural-motion";
import frozenRelease from "./releases/natural-cloud-wave-hand-v3-matte-v6b/manifest.json";
import ts from "typescript";
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
    const runtime = await readMotionCandidate("natural-cloud-wave-hand-v3-matte-v6b").catch(error => { if (error.code === "ENOENT") return null; throw error; });
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

function selectedFixture(): NaturalRuntimeManifest {
  const value = structuredClone(frozenRelease) as NaturalRuntimeManifest;
  value.version = DEFAULT_MOTION_CANDIDATE;
  value.assets = { ...value.assets, "bow-0": { ...Object.values(value.assets)[0], src: `/assistant/${value.version}/selected-bow-0.webp` },
    "thinking-0": { ...Object.values(value.assets)[0], src: `/assistant/${value.version}/selected-thinking-0.webp` } };
  return value;
}

test("selected preview inherits only the exact frozen release and allows only scoped new action pages", () => {
  assert.equal(DEFAULT_MOTION_CANDIDATE, "natural-selected-actions-v7");
  assert.equal(allowedMotionCandidate(DEFAULT_MOTION_CANDIDATE), true);
  assert.doesNotThrow(() => validateMotionCandidateSources(selectedFixture()));
  const edit = (change: (value: NaturalRuntimeManifest) => void) => {
    const value = selectedFixture(); change(value); assert.throws(() => validateMotionCandidateSources(value));
  };
  edit(v => { v.still.sha256 = "0".repeat(64); });
  edit(v => { v.anchorRgbaSha256 = "0".repeat(64); });
  edit(v => { v.clips.idle.frames[0].durationMs += 1; });
  edit(v => { v.clips.wave!.frames[0].rgbaSha256 = "0".repeat(64); });
  edit(v => { const k = Object.keys(frozenRelease.assets)[0]; v.assets = { ...v.assets, [k]: { ...v.assets[k], sha256: "0".repeat(64) } }; });
  edit(v => { v.assets = { ...v.assets, "forged-alias": Object.values(frozenRelease.assets)[0] as NaturalRuntimeManifest["assets"][string] }; });
  for (const src of ["/assistant/another-release/bow-0.webp", "/assistant/natural-selected-actions-v7/anchor.webp",
    "/assistant/natural-selected-actions-v7/idle-0.webp", "/assistant/natural-selected-actions-v7/../bow-0.webp",
    "/assistant/natural-selected-actions-v7/bow-0.webp?redirect=1", "/assistant/natural-selected-actions-v7/bow-0.webp/secret"]) {
    edit(v => { v.assets = { ...v.assets, "bow-0": { ...v.assets["bow-0"], src } }; });
  }
  const legacy = structuredClone(frozenRelease) as NaturalRuntimeManifest;
  legacy.assets = { ...legacy.assets, extra: { ...Object.values(legacy.assets)[0], src: `/assistant/${legacy.version}/bow-0.webp` } };
  assert.throws(() => validateMotionCandidateSources(legacy), /not allowed/);
});

test("selected local preview verifies inherited files and sends only new assets through its restricted route", async t => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const runtime = await readMotionCandidate().catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!runtime) { t.skip("Selected staging candidate is local and not shipped"); return; }
    assert.equal(runtime.still.src, frozenRelease.still.src);
    assert.equal("review" in runtime, false);
    for (const [key, asset] of Object.entries(frozenRelease.assets)) assert.deepEqual(runtime.assets[key], asset);
    for (const action of ["bow", "thinking"]) {
      const asset = Object.values(runtime.assets).find(a => a.src.includes(`/selected-${action}-`)); assert.ok(asset);
      assert.ok(asset.src.startsWith(`/api/dev/assistant-motion/${DEFAULT_MOTION_CANDIDATE}/`));
      const bytes = await readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, asset.src.split("/").at(-1)!);
      assert.ok(bytes.byteLength > 0);
    }
    await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, "anchor.webp"), /whitelist/);
    await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, "wave-0.webp"), /whitelist/);
    await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, "selected-bow-999999.webp"), /whitelist/);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test("acceptance buttons request all three real actions and unavailable clips cannot play", async () => {
  const text = await readFile(resolve("src/components/assistant/natural-motion-preview.tsx"), "utf8");
  const file = ts.createSourceFile("preview.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const buttons: ts.JsxElement[] = [];
  const visit = (node: ts.Node) => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "button") buttons.push(node); ts.forEachChild(node, visit); };
  visit(file);
  for (const [action, label] of [["wave", "挥手"], ["bow", "鞠躬"], ["thinking", "思考"]]) {
    const button = buttons.find(b => b.children.some(c => ts.isJsxText(c) && c.text.trim() === `待机 → ${label} → 待机`));
    assert.ok(button, `${action} acceptance button`);
    const attrs = button.openingElement.attributes.properties.map(a => a.getText(file));
    assert.ok(attrs.includes(`onClick={() => play("${action}")}`));
    assert.ok(attrs.includes(`disabled={!manifest.clips.${action}}`));
  }
  assert.match(text, /if \(manifest\.clips\[action\]\) setRequest/);
  assert.match(text, /previous\.playId === id \? \{ action: "idle", playId: id \+ 1 \}/);
  assert.match(text, /快速切换 8 次/);
  assert.match(text, /onClick=\{\(\) => handoff\(!open\)\}/);
});

test("new selected bytes cannot bypass their manifest hash even in an allowed directory", async () => {
  const previous = process.env.NODE_ENV, cwd = process.cwd();
  const temp = await mkdtemp(resolve(tmpdir(), "selected-motion-hash-test-"));
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    const root = resolve(temp, "docs/assistant/cloud-motion-suite-v1/batch-v3/selected-repair-v1/staging-v7");
    const assets = resolve(root, `public/assistant/${DEFAULT_MOTION_CANDIDATE}`);
    await mkdir(assets, { recursive: true });
    await writeFile(resolve(root, "manifest.json"), JSON.stringify(selectedFixture()));
    await writeFile(resolve(assets, "selected-bow-0.webp"), "not the declared asset bytes");
    process.chdir(temp);
    await assert.rejects(readMotionCandidateAsset(DEFAULT_MOTION_CANDIDATE, "selected-bow-0.webp"), /hash changed/);
  } finally {
    process.chdir(cwd);
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous });
    // This exact absolute path was created above by mkdtemp; no workspace data.
    await rm(temp, { recursive: true, force: true });
  }
});
