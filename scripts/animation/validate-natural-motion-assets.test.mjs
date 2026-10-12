import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { naturalManifestScope, naturalRgbaHash, validateNaturalMotionAssets } from "./validate-natural-motion-assets.mjs";
import { NATURAL_MOTION } from "../../src/lib/assistant/natural-motion.ts";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("configured production motion must pass actual asset and review validation before release", async () => {
  // scripts/run-unit-tests.mjs discovers this file automatically. Leaving the
  // feature null is safe; enabling it makes missing files/reports fail npm test.
  if (NATURAL_MOTION === null) return;
  const result = await validateNaturalMotionAssets(NATURAL_MOTION, fileURLToPath(new URL("../../", import.meta.url)));
  assert.equal(result.status, "ASSET_SCOPE_VERIFIED");
});

test("RGBA hash ignores only invisible RGB, never semitransparent color differences", () => {
  assert.equal(naturalRgbaHash(Buffer.from([1, 2, 3, 0])), naturalRgbaHash(Buffer.from([5, 6, 7, 0])));
  assert.notEqual(naturalRgbaHash(Buffer.from([1, 2, 3, 1])), naturalRgbaHash(Buffer.from([5, 6, 7, 1])));
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "natural-motion-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "public/assistant"), { recursive: true });
  await mkdir(join(root, "review"), { recursive: true });
  const rgba = Buffer.alloc(64 * 64 * 4);
  for (let y = 12; y < 52; y++) for (let x = 12; x < 52; x++) {
    const i = (y * 64 + x) * 4; rgba[i] = 40; rgba[i + 1] = 50; rgba[i + 2] = 60; rgba[i + 3] = 255;
  }
  const png = await sharp(rgba, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  await writeFile(join(root, "public/assistant/page.png"), png);
  await writeFile(join(root, "public/assistant/still.png"), png);
  await writeFile(join(root, "review/evidence.txt"), "Test fixture only. Not approval of a real character.");
  const frame = { asset: "page", x: 0, y: 0, durationMs: 100, rgbaSha256: sha(rgba) };
  const manifest = { version: "test", width: 64, height: 64, anchorRgbaSha256: sha(rgba),
    still: { src: "/assistant/still.png", sha256: sha(png) },
    review: { art: "PASS", technical: "PASS", transitions: "PASS", report: "review/report.json" },
    assets: { page: { src: "/assistant/page.png", width: 64, height: 64, sha256: sha(png), alpha: true } },
    clips: { idle: { frames: [{ ...frame }, { ...frame }] }, wave: { frames: [{ ...frame }, { ...frame }] } } };
  const makeReport = async () => {
    const review = reviewer => ({ status: "PASS", reviewer, reviewedAt: "2026-10-12T12:00:00Z", evidence: ["review/evidence.txt"] });
    await writeFile(join(root, "review/report.json"), JSON.stringify({ manifestVersion: manifest.version,
      manifestScopeSha256: naturalManifestScope(manifest), art: review("fixture-art"), technical: review("fixture-technical"), transitions: review("fixture-transitions") }));
  };
  await makeReport();
  return { root, manifest, makeReport, rgba };
}

test("checks real page, alpha, frame hashes, fallback and review scope", async t => {
  const { root, manifest } = await fixture(t);
  const result = await validateNaturalMotionAssets(manifest, root);
  assert.equal(result.status, "ASSET_SCOPE_VERIFIED"); assert.equal(result.frames, 4);
});
test("missing page, wrong content hash and wrong frame hash are rejected", async t => {
  const { root, manifest } = await fixture(t);
  const saved = manifest.assets.page.src;
  manifest.assets.page.src = "/assistant/missing.png";
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /ENOENT/);
  manifest.assets.page.src = saved;
  manifest.assets.page.sha256 = "a".repeat(64);
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /Asset SHA mismatch/);
  manifest.assets.page.sha256 = sha(await readFile(join(root, "public/assistant/page.png")));
  manifest.clips.wave.frames[0].rgbaSha256 = "b".repeat(64);
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /Invalid natural motion/);
});
test("same-size RGB file cannot masquerade as alpha asset", async t => {
  const { root, manifest } = await fixture(t);
  const rgb = await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).png().toBuffer();
  await writeFile(join(root, "public/assistant/page.png"), rgb);
  manifest.assets.page.sha256 = sha(rgb);
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /still alpha page/);
});
test("actual changed crop fails even when the manifest endpoints still claim equality", async t => {
  const { root, manifest, rgba } = await fixture(t);
  rgba[(20 * 64 + 20) * 4]++;
  const png = await sharp(rgba, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  await writeFile(join(root, "public/assistant/page.png"), png); manifest.assets.page.sha256 = sha(png);
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /Frame RGBA mismatch/);
});
test("stale review, missing evidence and non-independent reviewers cannot release", async t => {
  const { root, manifest, makeReport } = await fixture(t);
  manifest.clips.wave.frames[0].durationMs = 120;
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /does not bind/);
  await makeReport();
  const report = JSON.parse(await readFile(join(root, "review/report.json"), "utf8"));
  report.art.evidence = ["review/absent.png"];
  await writeFile(join(root, "review/report.json"), JSON.stringify(report));
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /ENOENT/);
  report.art.evidence = ["review/evidence.txt"]; report.art.reviewer = report.technical.reviewer;
  await writeFile(join(root, "review/report.json"), JSON.stringify(report));
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /independently/);
});
test("mismatched static fallback is rejected rather than flashing an older character", async t => {
  const { root, manifest, rgba } = await fixture(t);
  rgba[(20 * 64 + 20) * 4]++;
  const png = await sharp(rgba, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  await writeFile(join(root, "public/assistant/still.png"), png); manifest.still.sha256 = sha(png);
  await assert.rejects(validateNaturalMotionAssets(manifest, root), /Static fallback differs/);
});
