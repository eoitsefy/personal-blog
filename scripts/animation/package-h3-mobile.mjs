/**
 * Local mobile candidate derived from published RGBA atlases, not original RGB.
 * Never overwrites source assets or silently replaces an existing candidate.
 * Usage: node scripts/animation/package-h3-mobile.mjs [--verify-only]
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, readdir, statfs } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_MANIFEST = path.join(ROOT, "src/lib/assistant/releases/h3-v3/manifest.json");
const RELEASE = path.join(ROOT, "src/lib/assistant/releases/h3-mobile-v1");
const OUTPUT = path.join(ROOT, "public/assistant/h3-mobile-v1");
const PREFIX = "/assistant/h3-mobile-v1/";
const FRAME = 320;
const COLUMNS = 4;
const PAGE_FRAMES = 8;
const ENCODING = Object.freeze({ format: "webp", quality: 85, alphaQuality: 100, effort: 4, lossless: false, exact: true });
const RESAMPLING = Object.freeze({ sourceFrameWidth: 480, sourceFrameHeight: 480, width: FRAME, height: FRAME, kernel: "lanczos3", method: "crop each complete tile before resize; stitch raw RGBA without blending" });

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
export function alphaBytes(rgba) {
  assert.equal(rgba.length % 4, 0);
  const alpha = Buffer.allocUnsafe(rgba.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

export async function resizeFrame(rgba, width, height, left = 0, top = 0) {
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: 480, height: 480 })
    .resize(FRAME, FRAME, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha().raw().toBuffer();
}

export async function resizeAtlas(rgba) {
  assert.equal(rgba.length, 1920 * 960 * 4);
  const output = Buffer.alloc(1280 * 640 * 4);
  for (let slot = 0; slot < PAGE_FRAMES; slot++) {
    const tile = await resizeFrame(rgba, 1920, 960, (slot % 4) * 480, Math.floor(slot / 4) * 480);
    for (let row = 0; row < FRAME; row++) {
      const offset = ((Math.floor(slot / 4) * FRAME + row) * 1280 + (slot % 4) * FRAME) * 4;
      tile.copy(output, offset, row * FRAME * 4, (row + 1) * FRAME * 4);
    }
  }
  return output;
}

function sourcePath(src) {
  assert.match(src, /^\/assistant\/h3-v[23]\/[a-z0-9-]+\.webp$/);
  return path.join(ROOT, "public", src.slice(1));
}

async function saveIdenticalOrNew(filename, bytes) {
  try { await writeFile(filename, bytes, { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await readFile(filename), bytes, `Refusing to overwrite different existing candidate: ${filename}`);
  }
}

async function decode(bytes, width, height) {
  const image = sharp(bytes, { limitInputPixels: 2_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(metadata.pages ?? 1, 1);
  assert.equal(metadata.hasAlpha, true);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data.length, width * height * 4);
  return data;
}

function candidateBase(source, manifestHash) {
  assert.equal(source.version, "h3-motion-v3");
  assert.equal(source.width, 480);
  assert.equal(source.height, 480);
  assert.equal(source.columns, COLUMNS);
  assert.equal(source.pageFrames, PAGE_FRAMES);
  assert.equal(Object.keys(source.clips).length, 24);
  assert.equal(Object.keys(source.assets).length, 422);
  assert.equal(Object.keys(source.stills).length, 24);
  const clips = {};
  for (const [name, clip] of Object.entries(source.clips)) {
    assert.match(name, /^[a-z0-9-]+$/);
    assert.equal(clip.alphaExact, true);
    assert.equal(clip.durations.length, clip.frames);
    assert.equal(clip.durations.reduce((sum, duration) => sum + duration, 0), clip.durationMs);
    assert.equal(clip.pages.length, Math.ceil(clip.frames / PAGE_FRAMES));
    // Historic exact-alpha and zero RGB-error claims apply to the source only.
    const preserved = { ...clip };
    delete preserved.opaqueRgbMeanCompressionError;
    delete preserved.alphaExact;
    clips[name] = { ...preserved, alphaExact: false, scaledAlphaPreserved: true, sourceNativeAlphaExact: true };
  }
  return {
    version: "h3-mobile-v1", width: FRAME, height: FRAME, columns: COLUMNS, pageFrames: PAGE_FRAMES,
    review: { aiArtReview: false, userAuthorizedRelease: false },
    candidate: { localOnly: true, resampled: true, scaledAlphaPreserved: true, sourceNativeAlphaExact: true, sourceVersion: source.version },
    assets: {}, stills: {}, clips,
    provenance: {
      sourceKind: "published RGBA WebP atlases and stills; not original RGB/native source frames",
      sourceManifest: "src/lib/assistant/releases/h3-v3/manifest.json", sourceManifestSha256: manifestHash,
      sourceVersion: source.version, sourceProvenance: source.provenance,
      resampling: RESAMPLING, encoding: ENCODING,
      status: "Local technical candidate only; artwork/clarity not approved; not published",
      limitation: "Resampling changes RGB and alpha versus 480px source. Lossy WebP changes RGB again; only post-resize alpha is verified exact.",
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  assert(argv.every((argument) => argument === "--verify-only"), "Only --verify-only is supported");
  const verifyOnly = argv.includes("--verify-only");
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const disk = await statfs(ROOT, { bigint: true });
  const freeBytes = Number(disk.bavail * disk.bsize);
  assert(freeBytes > 1024 ** 3, "At least 1 GiB of free space is required");
  sharp.concurrency(1);
  sharp.cache({ memory: 32, files: 0, items: 16 });
  const sourceBytes = await readFile(SOURCE_MANIFEST);
  const manifestHash = sha256(sourceBytes);
  const source = JSON.parse(sourceBytes);
  const candidate = candidateBase(source, manifestHash);
  const existing = verifyOnly ? JSON.parse(await readFile(path.join(RELEASE, "manifest.json"))) : null;
  const files = [];
  const clipStatistics = [];
  let peakRssBytes = process.memoryUsage().rss;
  const memorySampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 250);
  if (!verifyOnly) { await mkdir(OUTPUT, { recursive: true }); await mkdir(RELEASE, { recursive: true }); }

  async function convert(key, descriptor, isStill, clipName, startFrame, frameCount) {
    assert.match(key, /^[a-z0-9-]+$/);
    const sourceFilename = sourcePath(descriptor.src);
    const original = await readFile(sourceFilename);
    assert.equal(sha256(original), descriptor.sha256, `Source hash mismatch: ${key}`);
    const sourceRaw = await decode(original, isStill ? 480 : 1920, isStill ? 480 : 960);
    const scaledRaw = isStill ? await resizeFrame(sourceRaw, 480, 480) : await resizeAtlas(sourceRaw);
    const width = isStill ? FRAME : 1280, height = isStill ? FRAME : 640;
    const src = `${PREFIX}${key}.webp`;
    const filename = path.join(OUTPUT, `${key}.webp`);
    const output = verifyOnly ? await readFile(filename) : await sharp(scaledRaw, { raw: { width, height, channels: 4 } }).webp(ENCODING).toBuffer();
    const outputHash = sha256(output);
    if (verifyOnly) {
      const recorded = isStill ? existing.stills[clipName] : existing.assets[key];
      assert.equal(recorded.src, src);
      assert.equal(recorded.sha256, outputHash);
    }
    const decoded = await decode(output, width, height);
    const expectedAlpha = alphaBytes(scaledRaw), actualAlpha = alphaBytes(decoded);
    assert.deepEqual(actualAlpha, expectedAlpha, `Resized alpha changed during WebP compression: ${key}`);
    if (!verifyOnly) await saveIdenticalOrNew(filename, output);
    const alphaFrames = [];
    for (let slot = 0; slot < frameCount; slot++) {
      const frameAlpha = Buffer.alloc(FRAME * FRAME);
      for (let row = 0; row < FRAME; row++) {
        const offset = ((isStill ? 0 : Math.floor(slot / 4) * FRAME) + row) * width + (isStill ? 0 : (slot % 4) * FRAME);
        actualAlpha.copy(frameAlpha, row * FRAME, offset, offset + FRAME);
      }
      alphaFrames.push({ frame: startFrame + slot, sha256: sha256(frameAlpha) });
    }
    files.push({ key, clip: clipName, kind: isStill ? "still" : "atlas", sourceSrc: descriptor.src, sourceSha256: descriptor.sha256,
      sourceBytes: original.length, src, sha256: outputHash, bytes: output.length, width, height,
      scaledAlphaPreserved: true, scaledAlphaSha256: sha256(expectedAlpha), decodedAlphaSha256: sha256(actualAlpha),
      firstFrame: startFrame, frameCount, alphaFrames });
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    return isStill ? { src, sha256: outputHash } : { src, width, height, sha256: outputHash, alpha: true };
  }

  try {
    for (const [clipName, clip] of Object.entries(source.clips)) {
      const fileStart = files.length;
      for (const [index, key] of clip.pages.entries()) {
        assert(source.assets[key], `Missing source asset ${key}`);
        candidate.assets[key] = await convert(key, source.assets[key], false, clipName, index * PAGE_FRAMES, Math.min(PAGE_FRAMES, clip.frames - index * PAGE_FRAMES));
      }
      candidate.stills[clipName] = await convert(`${clipName}-still`, source.stills[clipName], true, clipName, 0, 1);
      const own = files.slice(fileStart), sourceSize = own.reduce((sum, file) => sum + file.sourceBytes, 0), outputSize = own.reduce((sum, file) => sum + file.bytes, 0);
      clipStatistics.push({ clip: clipName, frames: clip.frames, durationMs: clip.durationMs, loop: clip.loop, pages: clip.pages.length,
        sourceBytes: sourceSize, outputBytes: outputSize, reductionPercent: (1 - outputSize / sourceSize) * 100,
        animationSourceBytes: own.filter((f) => f.kind === "atlas").reduce((sum, f) => sum + f.sourceBytes, 0),
        animationOutputBytes: own.filter((f) => f.kind === "atlas").reduce((sum, f) => sum + f.bytes, 0) });
      console.log(JSON.stringify({ clip: clipName, completedFiles: files.length, totalFiles: 446, ...clipStatistics.at(-1) }));
    }
    assert.equal(files.length, 446);
    assert.equal(files.filter((file) => file.kind === "atlas").reduce((sum, file) => sum + file.frameCount, 0), 3300);
    assert.deepEqual(Object.keys(candidate.assets), Object.keys(source.assets));
    assert.equal(new Set(files.map((file) => file.src)).size, files.length);
    assert.equal(sha256(await readFile(SOURCE_MANIFEST)), manifestHash, "Source manifest changed during conversion");
    for (const file of files) assert.equal(sha256(await readFile(sourcePath(file.sourceSrc))), file.sourceSha256, `Source changed during conversion: ${file.key}`);
    const filenames = (await readdir(OUTPUT)).sort();
    assert.deepEqual(filenames, files.map((file) => path.basename(file.src)).sort(), "Candidate directory has missing or unexpected files");
    const manifestBytes = Buffer.from(`${JSON.stringify(candidate)}\n`);
    if (verifyOnly) assert.deepEqual(existing, candidate, "Candidate manifest differs from derived source contract");
    else await saveIdenticalOrNew(path.join(RELEASE, "manifest.json"), manifestBytes);
    const sourceTotal = files.reduce((sum, file) => sum + file.sourceBytes, 0), total = files.reduce((sum, file) => sum + file.bytes, 0);
    const report = {
      status: "local-candidate-not-approved-not-published", startedAt, finishedAt: new Date().toISOString(), mode: verifyOnly ? "verify-only" : "generate-and-verify",
      elapsedSeconds: (performance.now() - started) / 1000, peakRssBytes, freeBytesBefore: freeBytes,
      node: process.version, sharpVersions: sharp.versions, concurrency: 1, cacheMemoryMiB: 32,
      sourceManifestSha256: manifestHash, manifestSha256: sha256(manifestBytes), sourceVersion: source.version, version: candidate.version,
      clips: 24, animationFrames: 3300, atlasFiles: 422, stillFiles: 24, files: files.length,
      sourceBytes: sourceTotal, outputBytes: total, reductionPercent: (1 - total / sourceTotal) * 100,
      decodedRgbaPageBytes: 1280 * 640 * 4, originalDecodedRgbaPageBytes: 1920 * 960 * 4,
      decodedRgbaThreePageBytes: 3 * 1280 * 640 * 4,
      durationAndFrameOrderPreserved: true, allSourceHashesVerifiedUnchanged: true,
      allOutputHashesVerified: true, allDimensionsVerified: true, all3300FrameAlphasVerifiedAgainstPostResize: true,
      all24StillAlphasVerifiedAgainstPostResize: true, alphaComparedToOriginal480IsExact: false,
      encoding: ENCODING, resampling: RESAMPLING, artworkReview: false, clarityAccepted: false, published: false,
      clipStatistics, fileIntegrity: files,
    };
    if (!verifyOnly) await saveIdenticalOrNew(path.join(RELEASE, "provenance.json"), Buffer.from(`${JSON.stringify({ sourceManifestSha256: manifestHash, encoding: ENCODING, resampling: RESAMPLING, fileIntegrity: files }, null, 2)}\n`));
    // Verification is run-specific evidence; a rerun uses a new file, never overwrites a previous report.
    const reportName = `verification-${startedAt.replace(/[-:.]/g, "")}.json`;
    await writeFile(path.join(RELEASE, reportName), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ status: report.status, report: path.join(RELEASE, reportName), files: report.files, sourceBytes: report.sourceBytes, outputBytes: report.outputBytes, reductionPercent: report.reductionPercent, elapsedSeconds: report.elapsedSeconds, peakRssBytes }));
    return report;
  } finally { clearInterval(memorySampler); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
