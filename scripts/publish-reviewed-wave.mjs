// Export approved whole PNGs to a static runtime atlas. No art generation,
// automatic approval, networking or server deployment is performed here.
import sharp from 'sharp';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, sep, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationPipeline, parseManifest, deriveMotion, deriveProvenance, validateFinalApproval, validatePlaybackReport, sha256, safeError } from './animation/pipeline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WAVE_RUNTIME_RECT = Object.freeze({ left: 180, top: 153, width: 366, height: 460 });
const columns = 6, sourceAnchor = { x: 384, y: 608 }, scale = 0.553763440860215 / 1.2;

export function waveExportContract(value) {
  const manifest = parseManifest(value), version = /^wave-v([1-9][0-9]{0,3})$/.exec(manifest.id)?.[1];
  const motion = deriveMotion(manifest), provenance = deriveProvenance(manifest);
  if (!version || manifest.action !== 'wave' || manifest.canvas.width !== 768 || manifest.canvas.height !== 768
    || manifest.keys.length !== 19 || manifest.interpolation.method !== 'hold' || manifest.motion.stepsPerInterval !== 1
    || motion.frameCount !== 37 || manifest.motion.fps !== 15 || manifest.motion.loopDurationMs !== 3000
    || provenance.unspecifiedFrames !== 0
    || manifest.motion.sequence.some((id, i) => id !== manifest.keys[Math.min(i, 36 - i)].id)) throw Error('unsupported_wave_runtime_contract');
  // Keep all six source counts in the contract: the runtime manifest expands
  // this object rather than incorrectly treating all prepared keys as authored.
  return { version, manifest, motion, provenance, sourceDir: `docs/assistant/wave-keyframes-v${version}`,
    src: `/assistant/chibi-wave-reviewed-v${version}.webp`, width: 2196, height: 3220, columns, frames: 37 };
}

async function safeOutput(repoRoot, relativePath) {
  const target = resolve(repoRoot, relativePath), rel = relative(resolve(repoRoot), target);
  if (rel.startsWith('..') || rel === '' || parse(rel).root) throw Error('unsafe_wave_publish_path');
  let cursor = parse(target).root;
  for (const part of relative(cursor, target).split(sep)) {
    cursor = resolve(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw Error('wave_publish_reparse_path_rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export function compareVisiblePixels(actual, expected) {
  if (actual.length !== expected.length || actual.length % 4) throw Error('wave_atlas_pixel_mismatch');
  for (let p = 0; p < actual.length; p += 4) {
    if (actual[p + 3] !== expected[p + 3] || (expected[p + 3] && !actual.subarray(p, p + 3).equals(expected.subarray(p, p + 3)))) throw Error('wave_atlas_pixel_mismatch');
  }
}

function fixedCrop(data) {
  const { left, top, width, height } = WAVE_RUNTIME_RECT, crop = Buffer.alloc(width * height * 4);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 768; x++) {
    if ((x < left || x >= left + width || y < top || y >= top + height) && data[(y * 768 + x) * 4 + 3] !== 0) throw Error('wave_runtime_crop_clips_artwork');
  }
  for (let y = 0; y < height; y++) data.copy(crop, y * width * 4, ((top + y) * 768 + left) * 4, ((top + y) * 768 + left + width) * 4);
  return crop;
}

async function wholePng(bytes) {
  const image = sharp(bytes, { limitInputPixels: 768 * 768 }), metadata = await image.metadata();
  if (metadata.format !== 'png' || metadata.width !== 768 || metadata.height !== 768 || (metadata.pages || 1) !== 1) throw Error('wave_source_canvas_mismatch');
  return image.ensureAlpha().raw().toBuffer();
}

export async function verifyReviewedWave({ manifestPath, repoRoot = root, toolRoot } = {}) {
  if (!manifestPath) throw Error('wave_manifest_argument_required');
  const pipeline = await AnimationPipeline.load(resolve(manifestPath), { repoRoot, ...(toolRoot ? { toolRoot } : {}) });
  const contract = waveExportContract(pipeline.manifest);
  if (resolve(manifestPath) !== resolve(repoRoot, contract.sourceDir, 'manifest.json')) throw Error('wave_manifest_directory_mismatch');
  let keyApproval;
  try { keyApproval = await pipeline.keyApproval(); }
  catch (error) { if (error.code === 'ENOENT') throw Error('key_art_approval_required'); throw error; }
  // Re-measure actual files with the current engine; never trust a PASSED label.
  const technical = await pipeline.check();
  if (!(await pipeline.receiptValid('preview'))) throw Error('browser_playback_not_completed');
  const report = await pipeline.readJson('interpolation.json'), playback = await pipeline.readJson('playback.json');
  const scopes = { manifestScopeSha256: pipeline.manifestScopeSha256, keyScopeSha256: pipeline.keyScopeSha256, frameScopeSha256: report.frameScopeSha256 };
  let approvalBytes;
  try { approvalBytes = await readFile(await pipeline.input(pipeline.manifest.review.finalApproval)); }
  catch (error) { if (error.code === 'ENOENT') throw Error('final_art_approval_required'); throw error; }
  const approval = validateFinalApproval(JSON.parse(approvalBytes.toString('utf8')), scopes);
  await pipeline.resourceGate();
  const sources = [], pixels = [], repositorySourcePngSha256 = [];
  for (let i = 0; i < contract.frames; i++) {
    const name = String(i).padStart(3, '0') + '.png', source = await readFile(await pipeline.output('frames/' + name));
    const data = await wholePng(source);
    if (sha256(data) !== report.frameHashes[i]) throw Error('wave_source_frame_scope_mismatch');
    const repositorySource = await readFile(await pipeline.input(contract.sourceDir + '/frames/' + name));
    if (!(await wholePng(repositorySource)).equals(data)) throw Error('wave_repository_frame_mismatch');
    repositorySourcePngSha256.push(sha256(repositorySource)); sources.push(source); pixels.push(data);
  }
  const sourcePngSha256 = sources.map(sha256);
  validatePlaybackReport(playback, { ...scopes, frameCount: contract.frames, sourcePngSha256, technicalStatus: 'PASSED_TECHNICAL_ONLY' });
  const crops = pixels.map(fixedCrop);
  // Runtime endpoints use the existing exact shared neutral from blink v6.
  const sharedNeutral = await sharp(resolve(repoRoot, 'public/assistant/chibi-blink-pilot-v6.webp'))
    .extract({ left: 0, top: 0, width: 366, height: 460 }).ensureAlpha().raw().toBuffer();
  compareVisiblePixels(crops[0], sharedNeutral); compareVisiblePixels(crops.at(-1), sharedNeutral);
  await pipeline.verifyInputs();
  return { pipeline, contract, scopes, technical, playback, keyApproval, approval, approvalSha256: sha256(approvalBytes), sourcePngSha256, sourceRgbaHashes: pixels.map(sha256), repositorySourcePngSha256, crops };
}

async function existingMatches(file, bytes) {
  try { if (!(await readFile(file)).equals(bytes)) throw Error('wave_versioned_export_conflict'); return true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
}

async function immutableOutput(repoRoot, path, bytes) {
  await mkdir(dirname(path), { recursive: true }); await safeOutput(repoRoot, relative(repoRoot, path));
  if (await existingMatches(path, bytes)) return;
  try { await writeFile(path, bytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; await existingMatches(path, bytes); }
}

export async function publishReviewedWave(options = {}) {
  const reviewed = await verifyReviewedWave(options), { pipeline, contract, scopes, crops } = reviewed;
  const summary = { status: 'APPROVED_FOR_RELEASE', ...scopes, version: contract.version, frames: contract.frames, sourcePngHashesVerified: reviewed.sourcePngSha256.length, productionChanged: false };
  if (options.checkOnly) return { ...summary, wroteAssets: false };
  const atlas = Buffer.alloc(contract.width * contract.height * 4), { width, height } = WAVE_RUNTIME_RECT;
  for (let i = 0; i < crops.length; i++) for (let y = 0; y < height; y++) {
    const left = i % columns * width, top = Math.floor(i / columns) * height;
    crops[i].copy(atlas, ((top + y) * contract.width + left) * 4, y * width * 4, (y + 1) * width * 4);
  }
  const bytes = await sharp(atlas, { raw: { width: contract.width, height: contract.height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'webp' || metadata.width !== contract.width || metadata.height !== contract.height || !metadata.hasAlpha || (metadata.pages || 1) !== 1) throw Error('wave_atlas_metadata_mismatch');
  const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
  compareVisiblePixels(decoded, atlas); // All 42 tiles, including five empty trailing cells.
  const asset = { src: contract.src, width: contract.width, height: contract.height, columns, frames: contract.frames,
    sourceIndices: Array.from({ length: contract.frames }, (_, i) => i), sourceRgbaHashes: reviewed.sourceRgbaHashes,
    bytes: bytes.length, sha256: sha256(bytes) };
  const runtimeDelayMs = Array.from({ length: contract.frames }, (_, i) => i === contract.frames - 1 ? 3000 - (contract.frames - 1) * 1000 / 15 : 1000 / 15);
  const runtime = { schemaVersion: 1, status: 'APPROVED_FOR_RELEASE', artReview: 'APPROVED_FOR_RELEASE', ...scopes,
    engineVersion: pipeline.engineVersion, engineSha256: pipeline.engineSha256, exporterSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    keyApproval: reviewed.keyApproval, finalApproval: reviewed.approval, finalApprovalSha256: reviewed.approvalSha256,
    technicalStatus: reviewed.technical.status, playback: reviewed.playback, ...contract.provenance,
    fps: 15, loopDurationMs: 3000, delayMs: contract.motion.delayMs, runtimeDelayMs, staticAtlas: true,
    rect: WAVE_RUNTIME_RECT, sourceAnchor, scale, noCrossfade: true, sourcePngSha256: reviewed.sourcePngSha256,
    repositorySourcePngSha256: reviewed.repositorySourcePngSha256, assets: { wave: asset }, productionChanged: false,
    timingNote: 'Runtime uses exact 15 fps steps and a 600 ms final neutral hold. PNG/WebP review uses integer 67 ms steps and a 588 ms final neutral hold; both last 3000 ms.' };
  const repoRoot = resolve(options.repoRoot || root), output = await safeOutput(repoRoot, 'public' + contract.src), manifestOutput = await safeOutput(repoRoot, contract.sourceDir + '/runtime-manifest.json');
  const manifestBytes = Buffer.from(JSON.stringify(runtime, null, 2) + '\n');
  // Preflight both immutable destinations before writing either. Existing
  // approved versioned outputs are never silently replaced by a new candidate.
  await existingMatches(output, bytes); await existingMatches(manifestOutput, manifestBytes);
  await pipeline.verifyInputs();
  await immutableOutput(repoRoot, output, bytes); await immutableOutput(repoRoot, manifestOutput, manifestBytes);
  return { ...summary, wroteAssets: true, asset, runtimeManifest: manifestOutput };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, ...flags] = process.argv.slice(2);
  try {
    if (!manifestPath || flags.some(flag => flag !== '--check')) throw Error('usage_publish_reviewed_wave_manifest_then_optional_check');
    console.log(JSON.stringify(await publishReviewedWave({ manifestPath, checkOnly: flags.includes('--check'), ...(process.env.ANIMATION_TOOL_ROOT ? { toolRoot: process.env.ANIMATION_TOOL_ROOT } : {}) }), null, 2));
  } catch (error) { console.error(JSON.stringify({ ok: false, reason: safeError(error), wroteAssets: flags.includes('--check') ? false : 'unconfirmed_check_versioned_outputs', productionChanged: false })); process.exitCode = 1; }
}
