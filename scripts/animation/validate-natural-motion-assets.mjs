// Run before enabling NATURAL_MOTION or publishing assets:
// node --import tsx scripts/animation/validate-natural-motion-assets.mjs <manifest.json> [repo-root]
// PASS claims remain reviewer judgments. This validator verifies their file/scope
// binding, never invents art approval from hashes or a successful image decode.
import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { validNaturalMotion } from "../../src/lib/assistant/natural-motion.ts";

const sha = data => createHash("sha256").update(data).digest("hex");
// PNG/WebP may differ in invisible RGB under alpha=0. Do not normalize partial
// alpha: that would hide visible edge defects. File-byte hashes remain untouched.
export function naturalRgbaHash(data) {
  const normalized = Buffer.from(data);
  for (let i = 0; i < normalized.length; i += 4) if (normalized[i + 3] === 0) normalized.fill(0, i, i + 3);
  return sha(normalized);
}
export function naturalManifestScope(manifest) {
  const { version, width, height, anchorRgbaSha256, still, assets, clips } = manifest;
  return sha(JSON.stringify({ version, width, height, anchorRgbaSha256, still, assets, clips }));
}
async function containedFile(root, name) {
  if (typeof name !== "string" || !name || isAbsolute(name)) throw new Error("Expected a repository-relative file");
  const base = await realpath(root), target = await realpath(resolve(base, name));
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !(await stat(target)).isFile()) throw new Error(`File escapes allowed root: ${name}`);
  return target;
}
export async function validateNaturalMotionAssets(manifest, repoRoot) {
  if (!validNaturalMotion(manifest)) throw new Error("Invalid natural motion manifest structure");
  const pages = new Map(), decodedFrames = new Map(), frameRecords = [];
  for (const [key, asset] of Object.entries(manifest.assets)) {
    const file = await containedFile(resolve(repoRoot, "public"), asset.src.slice(1));
    const bytes = await readFile(file);
    if (sha(bytes) !== asset.sha256) throw new Error(`Asset SHA mismatch: ${key}`);
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== asset.width || metadata.height !== asset.height || !metadata.hasAlpha || (metadata.pages ?? 1) !== 1)
      throw new Error(`Asset must be a still alpha page with declared dimensions: ${key}`);
    const { data, info } = await sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`Unexpected decoded channels: ${key}`);
    let transparent = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { transparent = true; break; }
    if (!transparent) throw new Error(`Opaque page is not a transparent character asset: ${key}`);
    pages.set(key, { data, width: info.width });
  }
  for (const [action, clip] of Object.entries(manifest.clips)) {
    for (const [index, frame] of clip.frames.entries()) {
      const page = pages.get(frame.asset), key = `${frame.asset}:${frame.x}:${frame.y}`;
      let pixels = decodedFrames.get(key);
      if (!pixels) {
        pixels = Buffer.alloc(manifest.width * manifest.height * 4);
        for (let y = 0; y < manifest.height; y++) {
          const from = ((frame.y + y) * page.width + frame.x) * 4;
          page.data.copy(pixels, y * manifest.width * 4, from, from + manifest.width * 4);
        }
        decodedFrames.set(key, pixels);
      }
      const measured = naturalRgbaHash(pixels);
      if (measured !== frame.rgbaSha256) throw new Error(`Frame RGBA mismatch: ${action}[${index}]`);
      let transparent = false, visible = false;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) transparent = true; if (pixels[i] > 0) visible = true; }
      if (!transparent || !visible) throw new Error(`Frame is opaque or blank: ${action}[${index}]`);
      if ((index === 0 || index === clip.frames.length - 1) && measured !== manifest.anchorRgbaSha256)
        throw new Error(`Actual endpoint mismatch: ${action}[${index}]`);
      frameRecords.push({ action, index, rgbaSha256: measured });
    }
  }
  // Fallback is actually shown on loading/visibility switches. It must represent
  // the same decoded anchor, not merely a visually similar older idle image.
  const fallbackFile = await containedFile(resolve(repoRoot, "public"), manifest.still.src.slice(1));
  const fallbackBytes = await readFile(fallbackFile);
  const fallbackMetadata = await sharp(fallbackBytes).metadata();
  if (sha(fallbackBytes) !== manifest.still.sha256 || fallbackMetadata.width !== manifest.width || fallbackMetadata.height !== manifest.height ||
    !fallbackMetadata.hasAlpha || (fallbackMetadata.pages ?? 1) !== 1) throw new Error("Static fallback content/dimensions/alpha mismatch");
  const fallback = await sharp(fallbackBytes).toColourspace("srgb").ensureAlpha().raw().toBuffer();
  if (naturalRgbaHash(fallback) !== manifest.anchorRgbaSha256) throw new Error("Static fallback differs from the common anchor");
  const scope = naturalManifestScope(manifest);
  const reportFile = await containedFile(repoRoot, manifest.review.report);
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  if (report.manifestVersion !== manifest.version || report.manifestScopeSha256 !== scope)
    throw new Error("Review report does not bind the exact manifest/assets/timing");
  for (const kind of ["art", "technical", "transitions"]) {
    const review = report[kind];
    if (!review || review.status !== "PASS" || typeof review.reviewer !== "string" || !review.reviewer.trim() ||
      !Number.isFinite(Date.parse(review.reviewedAt)) || !Array.isArray(review.evidence) || !review.evidence.length)
      throw new Error(`Missing explicit ${kind} review with evidence`);
    for (const evidence of review.evidence) {
      const file = await containedFile(repoRoot, evidence);
      if (!(await stat(file)).size) throw new Error(`Empty ${kind} evidence: ${evidence}`);
    }
  }
  if (report.art.reviewer === report.technical.reviewer) throw new Error("Art and technical reviews must be independently attributed");
  return { status: "ASSET_SCOPE_VERIFIED", manifestVersion: manifest.version, manifestScopeSha256: scope,
    assets: pages.size, frames: frameRecords.length, frameScopeSha256: sha(JSON.stringify(frameRecords)), rgbaHashEncoding: "srgb-u8-rgba-transparent-zero-v1",
    note: "Verifies supplied approval evidence and pixel identity; does not certify artistic truth or deployed website behavior." };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")] = process.argv.slice(2);
  if (!input) { console.error("Usage: node --import tsx validate-natural-motion-assets.mjs manifest.json [repo-root]"); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(await validateNaturalMotionAssets(JSON.parse(await readFile(input, "utf8")), root), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
