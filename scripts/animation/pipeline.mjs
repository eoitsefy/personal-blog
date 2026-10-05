// Offline whole-frame production. No image/text API, deployment or arbitrary command adapter.
import { z } from 'zod';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename, unlink, statfs, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, relative, sep, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freemem } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const ENGINE_VERSION = 'whole-frame-pipeline-v1';
export const ENGINE_SHA256 = sha256(await readFile(fileURLToPath(import.meta.url)));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).refine(value => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value));
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || /^[a-z]:/i.test(value) || /[\\:<>"|?*]/.test(value) || [...value].some(c => c.charCodeAt(0) < 32) || value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(\..*)?$/i.test(p))) throw Error('unsafe_relative_path');
  return value;
}
const artifactPath = z.string().max(400).refine(value => { try { safeRelative(value); return true; } catch { return false; } });
const source = z.object({ file: artifactPath.refine(value => value.endsWith('.png')), sha256: digest }).strict();
const parentFrame = { parentFrameScopeSha256: digest, parentFrameIndex: z.number().int().min(0).max(255) };
// Source declarations are scoped audit metadata, never an artistic verdict.
// Imported whole PNGs do not become independently authored merely by being keys.
export const KeyProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reference') }).strict(),
  z.object({ kind: z.literal('authored-keyframe') }).strict(),
  z.object({ kind: z.literal('interpolated-frame'), ...parentFrame }).strict(),
  z.object({ kind: z.literal('image-edited-frame'), ...parentFrame, editSourceSha256: digest }).strict(),
]);
export const ManifestSchema = z.object({
  schemaVersion: z.literal(1), id: name,
  action: z.enum(['idle', 'wave', 'nod', 'thinking', 'bow', 'cheer', 'yawn']),
  reference: source, editableMask: source,
  keys: z.array(source.extend({ id: name, provenance: KeyProvenanceSchema.optional() }).strict()).min(2).max(24),
  canvas: z.object({ width: z.number().int().min(64).max(1024), height: z.number().int().min(64).max(1024), safetyInset: z.literal(0.2) }).strict(),
  motion: z.object({ sequence: z.array(name).min(3).max(48), stepsPerInterval: z.number().int().min(1).max(8), fps: z.number().int().min(10).max(24), loopDurationMs: z.number().int().min(500).max(10000) }).strict(),
  interpolation: z.object({ method: z.enum(['hold', 'rife-rgba']), gpu: z.literal(1) }).strict(),
  review: z.object({ keyApproval: artifactPath.refine(v => v.endsWith('.json')), finalApproval: artifactPath.refine(v => v.endsWith('.json')) }).strict(),
}).strict().superRefine((m, ctx) => {
  const ids = new Set(m.keys.map(k => k.id));
  if (ids.size !== m.keys.length || m.motion.sequence.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'invalid_key_sequence' });
  if (m.motion.sequence[0] !== m.keys[0].id || m.motion.sequence.at(-1) !== m.keys[0].id) ctx.addIssue({ code: 'custom', message: 'neutral_endpoints_required' });
  const frameCount = (m.motion.sequence.length - 1) * m.motion.stepsPerInterval + 1;
  if (frameCount > 256 || m.motion.loopDurationMs <= (frameCount - 1) * Math.round(1000 / m.motion.fps)) ctx.addIssue({ code: 'custom', message: 'invalid_frame_timing' });
});
export function parseManifest(value) { return ManifestSchema.parse(value); }
export function manifestScope(manifest) { return sha256(Buffer.from(JSON.stringify(parseManifest(manifest)))); }
export function keyScope(referenceRgbaHash, keyRgbaHashes, maskRgbaHash, manifestHash) { return sha256(Buffer.from(JSON.stringify({ manifestHash, referenceRgbaHash, keyRgbaHashes, maskRgbaHash }))); }
export function deriveProvenance(manifest) {
  const m = parseManifest(manifest);
  const counts = { preparedKeyCount: m.keys.length, authoredKeyframes: 0, imageEditedFrames: 0, interpolatedFrames: 0, referenceFrames: 0, unspecifiedFrames: 0 };
  const fields = { reference: 'referenceFrames', 'authored-keyframe': 'authoredKeyframes', 'interpolated-frame': 'interpolatedFrames', 'image-edited-frame': 'imageEditedFrames' };
  for (const key of m.keys) counts[key.provenance ? fields[key.provenance.kind] : 'unspecifiedFrames']++;
  return counts;
}
export function deriveMotion(manifest) {
  const m = parseManifest(manifest), count = (m.motion.sequence.length - 1) * m.motion.stepsPerInterval + 1;
  const delayMs = Array.from({ length: count }, () => Math.round(1000 / m.motion.fps));
  delayMs[count - 1] = m.motion.loopDurationMs - delayMs.slice(0, -1).reduce((a, b) => a + b, 0);
  const indices = new Map(m.keys.map((key, i) => [key.id, i]));
  return { frameCount: count, delayMs, keyIndices: m.motion.sequence.map(id => indices.get(id)) };
}
const reviewIdentity = z.object({ schemaVersion: z.literal(1), reviewer: z.string().trim().min(2).max(100), reviewedAt: z.string().datetime(), scopeSha256: digest }).strict();
export function validateKeyApproval(value, scope) {
  const review = reviewIdentity.extend({ status: z.literal('APPROVED_FOR_INTERPOLATION_ONLY'), interpolationAllowed: z.literal(true), releaseAllowed: z.literal(false) }).strict().parse(value);
  if (review.scopeSha256 !== scope) throw Error('stale_key_art_approval');
  return review;
}
export function validateFinalApproval(value, scopes) {
  const review = reviewIdentity.extend({ status: z.literal('APPROVED_FOR_RELEASE'), releaseAllowed: z.literal(true), manifestScopeSha256: digest, keyScopeSha256: digest, frameScopeSha256: digest }).strict().parse(value);
  if (review.scopeSha256 !== scopes.frameScopeSha256 || ['manifestScopeSha256', 'keyScopeSha256', 'frameScopeSha256'].some(k => review[k] !== scopes[k])) throw Error('stale_final_art_approval');
  return review;
}
const PlaybackModeSchema = z.object({ speed: z.union([z.literal(1), z.literal(0.5)]), framesVisited: z.number().int().min(1).max(256), cycles: z.number().int().min(1), sourcePngHashesVerified: z.number().int().min(1).max(256), pixelMismatchFrames: z.array(z.number().int()).length(0) }).strict();
export const PlaybackReportSchema = z.object({
  status: z.literal('PASSED_PLAYBACK_ONLY'), technicalStatus: z.enum(['PASSED_TECHNICAL_ONLY', 'REJECTED_TECHNICAL']),
  manifestScopeSha256: digest, keyScopeSha256: digest, frameScopeSha256: digest,
  sourcePngSha256: z.array(digest).min(1).max(256), modes: z.array(PlaybackModeSchema).length(2),
  paused: z.literal(true), reducedMotionPaused: z.literal(true), mobileOverflow: z.literal(false),
  errors: z.array(z.string()).length(0), externalRequests: z.array(z.string()).length(0), releaseAllowed: z.literal(false),
}).strict();
export function validatePlaybackReport(value, expected) {
  const report = PlaybackReportSchema.parse(value);
  if (['manifestScopeSha256', 'keyScopeSha256', 'frameScopeSha256', 'technicalStatus'].some(key => report[key] !== expected[key]) || !Number.isInteger(expected.frameCount) || expected.frameCount < 1 || report.sourcePngSha256.length !== expected.frameCount || JSON.stringify(report.sourcePngSha256) !== JSON.stringify(expected.sourcePngSha256) || report.modes.some((mode, i) => mode.speed !== [1, 0.5][i] || mode.framesVisited !== expected.frameCount || mode.sourcePngHashesVerified !== expected.frameCount)) throw Error('stale_or_incomplete_browser_playback');
  return report;
}
export function browserChannel(value = 'msedge') {
  if (!['msedge', 'chrome', 'chromium'].includes(value)) throw Error('unapproved_browser_channel');
  return value;
}
export function assertExternalPathLength(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string' || !isAbsolute(path) || path.length > 240)) throw Error('external_tool_path_exceeds_240');
}
export async function resolvePlaywright(repoRoot, fallback = process.env.ANIMATION_PLAYWRIGHT_PACKAGE_JSON) {
  const local = createRequire(resolve(repoRoot, 'package.json'));
  let modulePath;
  try { modulePath = local.resolve('playwright'); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  if (modulePath) return { chromium: local('playwright').chromium, origin: 'repository' };
  if (!fallback) throw Error('playwright_missing_configure_explicit_fallback');
  if (!isAbsolute(fallback) || parse(fallback).base !== 'package.json' || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(fallback))) throw Error('invalid_playwright_lookup_anchor');
  // The explicit package.json is a Node module-lookup anchor. Its directory
  // must exist; the anchor file itself need not exist in bundled runtimes.
  await safeAncestors(parse(resolve(fallback)).root, fallback);
  if (!(await lstat(dirname(fallback))).isDirectory()) throw Error('invalid_playwright_lookup_anchor');
  const runtime = createRequire(resolve(fallback));
  try { runtime.resolve('playwright'); } catch { throw Error('playwright_missing_from_explicit_fallback'); }
  return { chromium: runtime('playwright').chromium, origin: 'explicit-local-fallback' };
}
export function assertResources(freeDiskBytes, freeMemoryBytes, comfyRunning) {
  if (!Number.isFinite(freeDiskBytes) || freeDiskBytes < 8 * 1024 ** 3) throw Error('system_disk_below_8gib');
  if (!Number.isFinite(freeMemoryBytes) || freeMemoryBytes < 4 * 1024 ** 3) throw Error('physical_memory_below_4gib');
  if (comfyRunning) throw Error('comfy_must_remain_stopped');
}
// A failed sleeve may be dark rather than skin-colored. Measure all alpha,
// without recoloring or clamping it, and keep human art approval independent.
export function silhouetteMetrics(data, mask, width, height) {
  let movingPixels = 0, translucentInterior = 0, detachedPixels = 0, detachedComponents = 0;
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    if (mask[p * 4 + 3] >= 128 && data[p * 4 + 3] >= 20) {
      movingPixels++; const x = p % width, y = Math.floor(p / width), alpha = data[p * 4 + 3];
      if (alpha < 220 && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        let interior = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (data[((y + dy) * width + x + dx) * 4 + 3] < 20) interior = false;
        if (interior) translucentInterior++;
      }
    }
    if (seen[p] || data[p * 4 + 3] < 32) continue;
    let head = 0, tail = 1, componentMoving = 0, anchored = false; seen[p] = 1; queue[0] = p;
    while (head < tail) {
      const q = queue[head++], x = q % width, y = Math.floor(q / width);
      if (mask[q * 4 + 3] >= 128) componentMoving++; else anchored = true;
      for (const n of [x > 0 ? q - 1 : -1, x + 1 < width ? q + 1 : -1, y > 0 ? q - width : -1, y + 1 < height ? q + width : -1]) {
        if (n >= 0 && !seen[n] && data[n * 4 + 3] >= 32) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    if (!anchored && componentMoving >= 8) { detachedComponents++; detachedPixels += componentMoving; }
  }
  return { movingPixels, translucentInterior, translucentInteriorRatio: translucentInterior / Math.max(1, movingPixels), detachedPixels, detachedComponents };
}
export async function verifyEncodedTimeline(webp, sourcePixels, sourceDelay, canvas) {
  const metadata = await sharp(webp, { animated: true }).metadata();
  const pages = metadata.pages || 1, pageHeight = metadata.pageHeight || metadata.height;
  const delays = metadata.delay || [sourceDelay.reduce((a, b) => a + b, 0)];
  if (metadata.width !== canvas.width || pageHeight !== canvas.height || delays.length !== pages || delays.some(delay => !Number.isInteger(delay) || delay <= 0) || sourceDelay.length !== sourcePixels.length || sourceDelay.some(delay => !Number.isInteger(delay) || delay <= 0) || delays.reduce((a, b) => a + b, 0) !== sourceDelay.reduce((a, b) => a + b, 0)) throw Error('packaged_animation_metadata_mismatch');
  const decoded = await sharp(webp, { animated: true }).ensureAlpha().raw().toBuffer();
  const stride = canvas.width * canvas.height * 4;
  let sourceTime = 0, page = 0, pageEnd = delays[0];
  // WebP may merge identical held frames. Compare its actual encoded page at
  // each approved PNG's time point, never invent retained drawing counts.
  for (let frame = 0; frame < sourcePixels.length; frame++) {
    const sourceEnd = sourceTime + sourceDelay[frame], expected = sourcePixels[frame];
    while (sourceTime < sourceEnd) {
      while (sourceTime >= pageEnd && page + 1 < pages) pageEnd += delays[++page];
      const actual = decoded.subarray(page * stride, (page + 1) * stride);
      if (actual.length !== expected.length) throw Error('packaged_animation_pixel_mismatch');
      for (let p = 0; p < stride; p += 4) {
        if (actual[p + 3] !== expected[p + 3]) throw Error('packaged_animation_pixel_mismatch');
        if (expected[p + 3] >= 8 && (actual[p] !== expected[p] || actual[p + 1] !== expected[p + 1] || actual[p + 2] !== expected[p + 2])) throw Error('packaged_animation_pixel_mismatch');
      }
      sourceTime = Math.min(sourceEnd, pageEnd);
    }
  }
  return { encodedFrameCount: pages, encodedDelayMs: delays, retainedPngCount: sourcePixels.length, timelinePixelCheck: 'PASSED' };
}
export function resolveArtifactPath(base, value) {
  safeRelative(value); const absolute = resolve(base, value);
  if (!absolute.startsWith(resolve(base) + sep)) throw Error('path_outside_artifact_root');
  return absolute;
}
async function safeAncestors(base, target) {
  const rel = relative(resolve(base), resolve(target));
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('path_outside_artifact_root');
  let cursor = parse(resolve(target)).root;
  // Check ancestors above the declared root too: a D:\Tools junction to C:
  // must not defeat the non-system-drive output rule.
  for (const segment of ['', ...relative(cursor, resolve(target)).split(sep).filter(Boolean)]) {
    if (segment) cursor = resolve(cursor, segment);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw Error('reparse_path_rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function pixels(file, canvas) {
  const metadata = await sharp(file, { limitInputPixels: canvas.width * canvas.height }).metadata();
  if (metadata.format !== 'png' || metadata.width !== canvas.width || metadata.height !== canvas.height || (metadata.pages || 1) !== 1) throw Error('prepared_canvas_mismatch');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== canvas.width || info.height !== canvas.height || info.channels !== 4) throw Error('prepared_canvas_mismatch');
  return data;
}
function cleanEnvironment(temp) {
  const env = { ...process.env, TEMP: temp, TMP: temp };
  for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete env[key];
  return env;
}
export class AnimationPipeline {
  static async load(manifestPath, options = {}) {
    const repoRoot = resolve(options.repoRoot || root), toolRoot = resolve(options.toolRoot || 'D:/CodexTools/assistant-animation');
    if (!isAbsolute(manifestPath) || !isAbsolute(options.repoRoot || repoRoot) || !isAbsolute(options.toolRoot || toolRoot)) throw Error('absolute_paths_required');
    if (process.platform === 'win32' && (!/^[d-z]:[\\/]/i.test(toolRoot) || toolRoot.length < 10)) throw Error('non_system_local_tool_root_required');
    await safeAncestors(repoRoot, manifestPath); await safeAncestors(toolRoot, toolRoot);
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    const instance = new AnimationPipeline(manifest, { repoRoot, toolRoot, manifestPath });
    await instance.verifyInputs();
    return instance;
  }
  constructor(manifest, options) {
    this.manifest = parseManifest(manifest); Object.assign(this, options);
    this.manifestScopeSha256 = manifestScope(this.manifest);
    this.engineVersion = ENGINE_VERSION; this.engineSha256 = ENGINE_SHA256;
    this.outputRoot = resolveArtifactPath(this.toolRoot, `jobs/pipeline/${manifest.id}/${this.manifestScopeSha256}/${this.engineSha256}`);
    this.state = { schemaVersion: 1, engineVersion: this.engineVersion, engineSha256: this.engineSha256, manifestScopeSha256: this.manifestScopeSha256, stages: {}, paidRequests: 0, productionChanged: false };
  }
  async input(value) { const target = resolveArtifactPath(this.repoRoot, value); await safeAncestors(this.repoRoot, target); return target; }
  async output(value) { const target = resolveArtifactPath(this.outputRoot, value); await safeAncestors(this.toolRoot, target); return target; }
  async verifyInputs() {
    const m = this.manifest;
    for (const source of [m.reference, m.editableMask, ...m.keys]) if (sha256(await readFile(await this.input(source.file))) !== source.sha256) throw Error('source_hash_mismatch');
    this.reference = await pixels(await this.input(m.reference.file), m.canvas);
    this.mask = await pixels(await this.input(m.editableMask.file), m.canvas);
    this.keys = await Promise.all(m.keys.map(async k => pixels(await this.input(k.file), m.canvas)));
    if (!this.keys[0].equals(this.reference)) throw Error('first_key_must_be_original_neutral');
    let editable = 0; for (let p = 3; p < this.mask.length; p += 4) if (this.mask[p] >= 128) editable++;
    if (!editable || editable > m.canvas.width * m.canvas.height / 2) throw Error('editable_mask_excessive_or_empty');
    this.keyScopeSha256 = keyScope(sha256(this.reference), this.keys.map(sha256), sha256(this.mask), this.manifestScopeSha256);
  }
  async immutable(value, bytes) {
    const target = await this.output(value); await mkdir(dirname(target), { recursive: true }); await safeAncestors(this.toolRoot, target);
    try { const existing = await readFile(target); if (!existing.equals(bytes)) throw Error('immutable_artifact_conflict'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(target, bytes, { flag: 'wx' }); }
    return { file: value, sha256: sha256(bytes) };
  }
  async json(value, data) { return this.immutable(value, Buffer.from(JSON.stringify(data, null, 2) + '\n')); }
  async readJson(value) { return JSON.parse(await readFile(await this.output(value), 'utf8')); }
  async persistState() {
    await mkdir(this.outputRoot, { recursive: true }); await safeAncestors(this.toolRoot, this.outputRoot);
    const tmp = await this.output(`state-${process.pid}.tmp`); await writeFile(tmp, JSON.stringify(this.state, null, 2) + '\n', { flag: 'wx' });
    await rename(tmp, await this.output('state.json'));
  }
  async receiptValid(stage) {
    const receipt = this.state.stages[stage];
    if (!receipt || receipt.status !== 'PASSED' || receipt.engineSha256 !== this.engineSha256 || receipt.manifestScopeSha256 !== this.manifestScopeSha256 || receipt.keyScopeSha256 !== this.keyScopeSha256 || !Array.isArray(receipt.artifacts) || !receipt.artifacts.length) return false;
    for (const artifact of receipt.artifacts) {
      if (!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256 || '')) throw Error('invalid_stage_artifact_receipt');
      if (sha256(await readFile(await this.output(artifact.file))) !== artifact.sha256) throw Error('cached_artifact_hash_mismatch');
    }
    return true;
  }
  async locked(command, action) {
    await mkdir(this.outputRoot, { recursive: true }); await safeAncestors(this.toolRoot, this.outputRoot);
    const lock = await this.output('run.lock');
    try { await writeFile(lock, JSON.stringify({ pid: process.pid, command, createdAt: new Date().toISOString() }), { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw Error('pipeline_already_running_or_stale_lock'); throw error; }
    try {
      try { this.state = await this.readJson('state.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (this.state.manifestScopeSha256 !== this.manifestScopeSha256 || this.state.engineSha256 !== this.engineSha256) throw Error('state_scope_mismatch');
      await this.verifyInputs(); const result = await action(); await this.verifyInputs(); await this.persistState(); return result;
    } catch (error) {
      this.state.stages[command] = { status: 'BLOCKED', reason: safeError(error), engineSha256: this.engineSha256, manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, at: new Date().toISOString() };
      await this.persistState(); throw error;
    } finally { await unlink(lock); }
  }
  async resourceGate() {
    const disk = await statfs(process.platform === 'win32' ? 'C:/Windows' : this.toolRoot);
    let comfyRunning = false;
    if (process.platform === 'win32') {
      const result = await execute('powershell.exe', ['-NoProfile', '-Command', '[bool](Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)'], { timeout: 15000 });
      comfyRunning = result.stdout.trim().toLowerCase() === 'true';
    }
    const result = { freeDiskBytes: Number(disk.bavail) * Number(disk.bsize), freeMemoryBytes: freemem(), comfyRunning };
    assertResources(result.freeDiskBytes, result.freeMemoryBytes, result.comfyRunning); return result;
  }
  externalPathGate() {
    if (this.manifest.interpolation.method !== 'rife-rgba') return;
    const segment = this.manifest.motion.sequence.length - 2, prefix = resolve(this.outputRoot, `temporary/s${segment}/alpha/a-zzzzzzzzzz`);
    assertExternalPathLength([resolveArtifactPath(this.toolRoot, 'tools/rife-v4.6/rife-ncnn-vulkan.exe'), resolveArtifactPath(this.toolRoot, 'tools/rife-v4.6/rife-v4.6'), resolve(prefix, 'in/00000001.png'), resolve(prefix, 'out/00000008.png')]);
  }
  async doctor() { this.externalPathGate(); browserChannel(process.env.ANIMATION_BROWSER_CHANNEL || 'msedge'); return { engineVersion: this.engineVersion, engineSha256: this.engineSha256, manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, outputRoot: this.outputRoot, resources: await this.resourceGate(), paidRequests: 0, productionChanged: false }; }
  measure(data, index) {
    const { width, height, safetyInset } = this.manifest.canvas;
    let staticChanges = 0, opaqueSkin = 0, translucentSkin = 0, safeMargins = true;
    for (let p = 0; p < width * height; p++) {
      const offset = p * 4, x = p % width, y = Math.floor(p / width), alpha = data[offset + 3], editable = this.mask[offset + 3] >= 128;
      if (!editable && !data.subarray(offset, offset + 4).equals(this.reference.subarray(offset, offset + 4))) staticChanges++;
      if (alpha >= 8 && (x < width * safetyInset || x >= width * (1 - safetyInset) || y < height * safetyInset || y >= height * (1 - safetyInset))) safeMargins = false;
      if (editable && alpha >= 20 && data[offset] > 160 && data[offset] > data[offset + 1] + 8 && data[offset + 1] > data[offset + 2] + 8) {
        if (alpha >= 245) opaqueSkin++; else translucentSkin++;
      }
    }
    const skinTranslucentRatio = translucentSkin / Math.max(1, opaqueSkin + translucentSkin), exactNeutral = data.equals(this.reference);
    const silhouette = silhouetteMetrics(data, this.mask, width, height);
    return { index, rgbaSha256: sha256(data), staticChanges, safeMargins, exactNeutral, skinTranslucentRatio, ...silhouette,
      passed: staticChanges === 0 && safeMargins && (exactNeutral || (skinTranslucentRatio < 0.05 && silhouette.detachedComponents === 0 && silhouette.translucentInteriorRatio < 0.02)) };
  }
  mark(stage, artifacts, extra = {}) { this.state.stages[stage] = { status: 'PASSED', engineSha256: this.engineSha256, manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, artifacts, ...extra }; }
  async prepareStage() {
    if (await this.receiptValid('prepare')) return this.state.stages.prepare;
    const measures = this.keys.map((data, i) => this.measure(data, i));
    if (measures.some(m => !m.passed)) throw Error('prepared_keys_technical_rejected');
    const artifacts = [];
    for (const [i, key] of this.manifest.keys.entries()) artifacts.push(await this.immutable(`keys/${String(i).padStart(3, '0')}-${key.id}.png`, await readFile(await this.input(key.file))));
    artifacts.push(await this.json('prepared.json', { manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, ...deriveProvenance(this.manifest), measures, releaseAllowed: false }));
    this.mark('prepare', artifacts); return this.state.stages.prepare;
  }
  async keyApproval() { return validateKeyApproval(JSON.parse(await readFile(await this.input(this.manifest.review.keyApproval), 'utf8')), this.keyScopeSha256); }
  async interpolateStage() {
    await this.prepareStage(); await this.keyApproval();
    if (await this.receiptValid('interpolate')) return this.state.stages.interpolate;
    const m = this.manifest, steps = m.motion.stepsPerInterval, ids = new Map(m.keys.map((k, i) => [k.id, i]));
    const sequence = m.motion.sequence.map(id => this.keys[ids.get(id)]), frames = [], artifacts = [];
    if (m.interpolation.method === 'rife-rgba') { this.externalPathGate(); await this.verifyRife(); }
    for (let segment = 0; segment < sequence.length - 1; segment++) {
      const from = sequence[segment], to = sequence[segment + 1];
      let predictions = null;
      if (m.interpolation.method === 'rife-rgba' && steps > 1 && !from.equals(to)) predictions = await this.rifePair(from, to, segment, steps);
      for (let step = 0; step < steps; step++) {
        let data = Buffer.from(from);
        if (predictions && step > 0) {
          const color = predictions.color[step], alpha = predictions.alpha[step]; data = Buffer.from(this.reference);
          for (let p = 0; p < m.canvas.width * m.canvas.height; p++) if (this.mask[p * 4 + 3] >= 128) {
            const a = Math.round((alpha[p * 3] + alpha[p * 3 + 1] + alpha[p * 3 + 2]) / 3);
            if (a < 8) { data.fill(0, p * 4, p * 4 + 4); continue; }
            for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.max(0, Math.min(255, Math.round((color[p * 3 + c] - 128 * (1 - a / 255)) / (a / 255))));
            data[p * 4 + 3] = a;
          }
        }
        frames.push(data);
      }
    }
    frames.push(Buffer.from(sequence.at(-1)));
    for (const [i, data] of frames.entries()) artifacts.push(await this.immutable(`frames/${String(i).padStart(3, '0')}.png`, await sharp(data, { raw: { ...m.canvas, channels: 4 } }).png().toBuffer()));
    const frameHashes = frames.map(sha256), { delayMs } = deriveMotion(m);
    const frameScopeSha256 = sha256(Buffer.from(frameHashes.join('')));
    const report = { manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256, frameHashes, delayMs, frameCount: frames.length, method: m.interpolation.method, ...deriveProvenance(m), paidRequests: 0, productionChanged: false, releaseAllowed: false };
    artifacts.push(await this.json('interpolation.json', report)); this.mark('interpolate', artifacts, { frameScopeSha256 }); return report;
  }
  async verifyRife() {
    const checks = [['tools/rife-v4.6/rife-ncnn-vulkan.exe', '4b970319db2814c82b15fceed8193151560a676a9eb63f20d4877be77b98f44f'], ['tools/rife-v4.6/rife-v4.6/flownet.bin', 'f334ed2260149ce0188a6dcf049844e8b0cdd912e01cbcfb63553157d2508958'], ['tools/rife-v4.6/rife-v4.6/flownet.param', '28df14d57a225725ee5386f52eba422488450d37c9f40800ed4f62e8ba846692']];
    for (const [file, expected] of checks) { const path = resolveArtifactPath(this.toolRoot, file); await safeAncestors(this.toolRoot, path); if (sha256(await readFile(path)) !== expected) throw Error('rife_toolchain_hash_mismatch'); }
  }
  async rifePair(from, to, segment, steps) {
    const { width, height } = this.manifest.canvas, results = {};
    for (const channel of ['color', 'alpha']) {
      await this.resourceGate();
      const cacheFile = `temporary/segment-${segment}/${channel}/receipt.json`;
      let cached = null;
      try { cached = await this.readJson(cacheFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (cached) {
        if (cached.manifestScopeSha256 !== this.manifestScopeSha256 || cached.inputRgbaSha256.join('') !== [sha256(from), sha256(to)].join('') || cached.steps !== steps) throw Error('rife_cache_scope_mismatch');
        results[channel] = [];
        for (const artifact of cached.outputs) {
          const file = await this.output(artifact.file); if (sha256(await readFile(file)) !== artifact.sha256) throw Error('rife_cache_hash_mismatch');
          const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          if (info.width !== width || info.height !== height || info.channels !== 3) throw Error('rife_output_canvas_mismatch'); results[channel].push(data);
        }
        if (results[channel].length !== steps) throw Error('rife_cache_count_mismatch'); continue;
      }
      // Partial failed attempts are preserved. Resumption uses a fresh output
      // directory rather than silently overwriting a previous tool result.
      const prefix = `temporary/s${segment}/${channel}/a-${Date.now().toString(36)}`;
      const work = await this.output(prefix), input = resolve(work, 'in'), output = resolve(work, 'out');
      assertExternalPathLength([resolve(input, '00000001.png'), resolve(output, '00000008.png')]);
      await mkdir(input, { recursive: true }); await mkdir(output, { recursive: true }); await safeAncestors(this.toolRoot, output);
      for (const [i, data] of [from, to].entries()) {
        const rgb = Buffer.alloc(width * height * 3);
        for (let p = 0; p < width * height; p++) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = channel === 'alpha' ? data[p * 4 + 3] : Math.round(data[p * 4 + c] * data[p * 4 + 3] / 255 + 128 * (1 - data[p * 4 + 3] / 255));
        await this.immutable(`${prefix}/in/${String(i).padStart(8, '0')}.png`, await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer());
      }
      const exe = resolveArtifactPath(this.toolRoot, 'tools/rife-v4.6/rife-ncnn-vulkan.exe'), model = resolveArtifactPath(this.toolRoot, 'tools/rife-v4.6/rife-v4.6');
      await execute(exe, ['-i', input, '-o', output, '-n', String(2 * steps), '-m', model, '-g', '1', '-j', '1:1:1', '-f', '%08d.png'], { cwd: dirname(exe), env: cleanEnvironment(work), timeout: 180000, maxBuffer: 1000000 });
      results[channel] = []; const outputs = [];
      for (let i = 0; i < steps; i++) {
        const file = resolve(output, String(i + 1).padStart(8, '0') + '.png'); await safeAncestors(this.toolRoot, file);
        const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        if (info.width !== width || info.height !== height || info.channels !== 3) throw Error('rife_output_canvas_mismatch'); results[channel].push(data);
        outputs.push({ file: `${prefix}/out/${String(i + 1).padStart(8, '0')}.png`, sha256: sha256(await readFile(file)) });
      }
      await this.json(cacheFile, { manifestScopeSha256: this.manifestScopeSha256, inputRgbaSha256: [sha256(from), sha256(to)], steps, outputs });
    }
    return results;
  }
  async checkStage() {
    await this.prepareStage();
    // No cached verdict is trusted: every frame is read and re-measured.
    if (!(await this.receiptValid('interpolate'))) throw Error('interpolation_not_completed');
    const report = await this.readJson('interpolation.json'), measures = [], motion = deriveMotion(this.manifest), provenance = deriveProvenance(this.manifest);
    if (report.manifestScopeSha256 !== this.manifestScopeSha256 || report.keyScopeSha256 !== this.keyScopeSha256 || report.method !== this.manifest.interpolation.method || 'independentDrawings' in report || Object.entries(provenance).some(([field, count]) => report[field] !== count) || report.frameCount !== motion.frameCount || JSON.stringify(report.delayMs) !== JSON.stringify(motion.delayMs) || !Array.isArray(report.frameHashes) || report.frameHashes.length !== motion.frameCount) throw Error('interpolation_report_manifest_mismatch');
    const expectedFiles = Array.from({ length: motion.frameCount }, (_, i) => String(i).padStart(3, '0') + '.png');
    if (JSON.stringify((await readdir(await this.output('frames'))).sort()) !== JSON.stringify(expectedFiles)) throw Error('unexpected_frame_directory_contents');
    for (let i = 0; i < motion.frameCount; i++) {
      const actual = await pixels(await this.output(`frames/${String(i).padStart(3, '0')}.png`), this.manifest.canvas), measure = this.measure(actual, i);
      const exactKey = i % this.manifest.motion.stepsPerInterval === 0;
      const exactKeyMatches = !exactKey || actual.equals(this.keys[motion.keyIndices[i / this.manifest.motion.stepsPerInterval]]);
      measures.push({ ...measure, exactKey, exactKeyMatches, passed: measure.passed && exactKeyMatches });
    }
    const frameScopeSha256 = sha256(Buffer.from(measures.map(m => m.rgbaSha256).join('')));
    if (frameScopeSha256 !== report.frameScopeSha256 || JSON.stringify(measures.map(m => m.rgbaSha256)) !== JSON.stringify(report.frameHashes)) throw Error('frame_scope_mismatch');
    const passed = measures.every(m => m.passed) && measures[0].exactNeutral && measures.at(-1).exactNeutral;
    const verdict = { status: passed ? 'PASSED_TECHNICAL_ONLY' : 'REJECTED_TECHNICAL', manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256, measures, releaseAllowed: false, warnings: ['Numerical checks cannot detect all connected sleeve ghosts, palette drift or malformed hands. The known v8 double-sleeve ghost can evade skin, component and alpha-area metrics. Full visual review remains mandatory.'] };
    const artifact = await this.json('technical.json', verdict);
    this.state.stages.check = { status: passed ? 'PASSED' : 'BLOCKED', engineSha256: this.engineSha256, manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256, artifacts: [artifact] };
    if (!passed) throw Error('animation_technical_rejected'); return verdict;
  }
  async previewStage() {
    const report = await this.readJson('interpolation.json'); let technicalStatus = 'PASSED_TECHNICAL_ONLY';
    try { await this.checkStage(); }
    catch (error) { if (error.message !== 'animation_technical_rejected') throw error; technicalStatus = 'REJECTED_TECHNICAL'; }
    const pngFileSha256 = await Promise.all(Array.from({ length: report.frameCount }, async (_, i) => sha256(await readFile(await this.output(`frames/${String(i).padStart(3, '0')}.png`)))));
    const playbackExpected = { manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256: report.frameScopeSha256, frameCount: report.frameCount, sourcePngSha256: pngFileSha256, technicalStatus };
    if (await this.receiptValid('preview')) return validatePlaybackReport(await this.readJson('playback.json'), playbackExpected);
    const html = previewHtml({ ...report, pngFileSha256 }, this.manifest.canvas);
    const htmlArtifact = await this.immutable('preview.html', Buffer.from(html));
    const channel = browserChannel(process.env.ANIMATION_BROWSER_CHANNEL || 'msedge'), { chromium } = await resolvePlaywright(this.repoRoot);
    const temp = await this.output('temporary/browser'); await mkdir(temp, { recursive: true });
    const server = createServer(async (request, response) => {
      try {
        if (request.method !== 'GET') { response.writeHead(405).end(); return; }
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (path !== '/' && !/^\/frames\/\d{3}\.png$/.test(path)) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', path === '/' ? 'text/html; charset=utf-8' : 'image/png');
        response.end(await readFile(await this.output(path === '/' ? 'preview.html' : path.slice(1))));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
      browser = await chromium.launch({ channel, headless: true, env: cleanEnvironment(temp) });
      const page = await browser.newPage(), errors = [], externalRequests = [];
      page.on('pageerror', error => errors.push(error.name)); page.on('request', req => { if (!req.url().startsWith(origin + '/')) externalRequests.push('external_request'); });
      await page.goto(origin, { waitUntil: 'networkidle' }); await page.evaluate(() => window.playbackReady);
      const modes = [];
      for (const speed of [1, 0.5]) {
        await page.evaluate(speed => window.beginPlayback(speed), speed);
        await page.waitForFunction(count => window.audit.cycles >= 1 && window.audit.visited.size === count, report.frameCount, { timeout: report.delayMs.reduce((a, b) => a + b, 0) * 2.5 + 10000 });
        modes.push(await page.evaluate(() => ({ speed: window.audit.speed, framesVisited: window.audit.visited.size, cycles: window.audit.cycles, sourcePngHashesVerified: window.audit.sourceHashesVerified, pixelMismatchFrames: [...window.audit.pixelMismatchFrames] })));
      }
      await page.evaluate(() => window.pausePlayback()); const before = await page.evaluate(() => window.audit.index);
      await page.waitForTimeout(200); const paused = before === await page.evaluate(() => window.audit.index);
      await page.evaluate(() => window.beginPlayback(1)); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
      const reducedIndex = await page.evaluate(() => window.audit.index); await page.waitForTimeout(200);
      const reducedMotionPaused = await page.evaluate(index => !window.audit.playing && window.audit.index === index, reducedIndex);
      await page.setViewportSize({ width: 390, height: 844 }); const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const verdict = { status: errors.length || externalRequests.length || !paused || !reducedMotionPaused || mobileOverflow || modes.some(mode => mode.pixelMismatchFrames.length || mode.sourcePngHashesVerified !== report.frameCount) ? 'REJECTED_PLAYBACK' : 'PASSED_PLAYBACK_ONLY', technicalStatus, manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256: report.frameScopeSha256, sourcePngSha256: pngFileSha256, modes, paused, reducedMotionPaused, mobileOverflow, errors, externalRequests, releaseAllowed: false };
      const artifact = await this.json('playback.json', verdict); this.mark('preview', [htmlArtifact, artifact], { frameScopeSha256: report.frameScopeSha256 });
      if (verdict.status !== 'PASSED_PLAYBACK_ONLY') throw Error('browser_playback_rejected'); return validatePlaybackReport(verdict, playbackExpected);
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  }
  async packageStage() {
    await this.keyApproval(); await this.checkStage();
    if (!(await this.receiptValid('preview'))) throw Error('browser_playback_not_completed');
    const interpolation = await this.readJson('interpolation.json'), playback = await this.readJson('playback.json');
    const scopes = { manifestScopeSha256: this.manifestScopeSha256, keyScopeSha256: this.keyScopeSha256, frameScopeSha256: interpolation.frameScopeSha256 };
    const sources = await Promise.all(Array.from({ length: interpolation.frameCount }, async (_, i) => readFile(await this.output(`frames/${String(i).padStart(3, '0')}.png`))));
    validatePlaybackReport(playback, { ...scopes, frameCount: interpolation.frameCount, sourcePngSha256: sources.map(sha256), technicalStatus: 'PASSED_TECHNICAL_ONLY' });
    const approval = validateFinalApproval(JSON.parse(await readFile(await this.input(this.manifest.review.finalApproval), 'utf8')), scopes);
    const webp = await sharp(sources, { join: { animated: true } }).webp({ lossless: true, effort: 6, loop: 0, delay: interpolation.delayMs }).toBuffer();
    const encodedTimeline = await verifyEncodedTimeline(webp, await Promise.all(sources.map(source => sharp(source).ensureAlpha().raw().toBuffer())), interpolation.delayMs, this.manifest.canvas);
    const asset = await this.immutable('release/animation.webp', webp);
    const metadata = await this.json('release/package.json', { ...scopes, approval, asset, frameCount: interpolation.frameCount, ...encodedTimeline, byteSize: webp.length, fps: this.manifest.motion.fps, delayMs: interpolation.delayMs, ...deriveProvenance(this.manifest), method: this.manifest.interpolation.method, deployAllowed: false, paidRequests: 0, note: 'Offline artifact only. Packaging is not deployment authorization.' });
    this.mark('package', [asset, metadata], scopes); return { ...scopes, asset: await this.output(asset.file), productionChanged: false };
  }
  async prepare() { return this.locked('prepare', () => this.prepareStage()); }
  async interpolate() { return this.locked('interpolate', () => this.interpolateStage()); }
  async check() { return this.locked('check', () => this.checkStage()); }
  async preview() { return this.locked('preview', () => this.previewStage()); }
  async package() { return this.locked('package', () => this.packageStage()); }
  async run() { return this.locked('run', async () => { await this.prepareStage(); await this.interpolateStage(); await this.checkStage(); await this.previewStage(); return this.packageStage(); }); }
  async status() { try { return await this.readJson('state.json'); } catch (error) { if (error.code === 'ENOENT') return this.state; throw error; } }
}
function previewHtml(report, canvas) {
  const config = JSON.stringify({ ...report, canvas }).replaceAll('<', '\\u003c');
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline animation review</title><style>body{margin:0;background:#f4f1e9;color:#181e25;font:16px sans-serif}main{max-width:900px;margin:auto;padding:16px;box-sizing:border-box}canvas{display:block;width:min(100%,420px);height:auto;margin:auto}button{padding:12px;font:inherit}p{overflow-wrap:anywhere}</style><main><h1>Offline animation review</h1><p>Technical preview is not artistic approval.</p><button onclick="beginPlayback(1)">Normal speed</button><button onclick="beginPlayback(.5)">Half speed</button><button onclick="pausePlayback()">Pause</button><button onclick="document.body.style.background='#181e25'">Dark</button><button onclick="document.body.style.background='#f4f1e9'">Light</button><canvas width="${canvas.width}" height="${canvas.height}"></canvas></main><script>
const config=${config};const ctx=document.querySelector('canvas').getContext('2d',{willReadFrequently:true});const frames=[],expectedPixels=[];const audit=window.audit={index:0,visited:new Set(),cycles:0,speed:1,playing:false,sourceHashesVerified:0,pixelMismatchFrames:new Set()};let timer;
window.playbackReady=Promise.all(Array.from({length:config.frameCount},async(_,i)=>{const response=await fetch('frames/'+String(i).padStart(3,'0')+'.png');if(!response.ok)throw Error('missing_frame');const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==config.pngFileSha256[i])throw Error('source_png_hash_mismatch');audit.sourceHashesVerified++;const img=await createImageBitmap(new Blob([bytes],{type:'image/png'}));frames[i]=img;const canvas=new OffscreenCanvas(config.canvas.width,config.canvas.height),sample=canvas.getContext('2d',{willReadFrequently:true});sample.drawImage(img,0,0);expectedPixels[i]=sample.getImageData(0,0,canvas.width,canvas.height).data})).then(()=>{ctx.drawImage(frames[0],0,0)});
function draw(){ctx.clearRect(0,0,config.canvas.width,config.canvas.height);ctx.drawImage(frames[audit.index],0,0);const actual=ctx.getImageData(0,0,config.canvas.width,config.canvas.height).data,expected=expectedPixels[audit.index];for(let p=0;p<actual.length;p++)if(actual[p]!==expected[p]){audit.pixelMismatchFrames.add(audit.index);break}audit.visited.add(audit.index)}
function next(){if(!audit.playing)return;draw();timer=setTimeout(()=>{audit.index++;if(audit.index===frames.length){audit.index=0;audit.cycles++}next()},config.delayMs[audit.index]/audit.speed)}
window.pausePlayback=()=>{audit.playing=false;clearTimeout(timer)};window.beginPlayback=async speed=>{await window.playbackReady;pausePlayback();audit.index=0;audit.cycles=0;audit.visited=new Set();audit.pixelMismatchFrames=new Set();audit.speed=speed;if(matchMedia('(prefers-reduced-motion: reduce)').matches){draw();return}audit.playing=true;next()};matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches)pausePlayback()});
</script></html>`;
}
export function safeError(error) { return /^[a-z0-9_]{1,100}$/.test(error.message || '') ? error.message : error instanceof z.ZodError ? 'manifest_or_review_validation_failed' : 'local_pipeline_error'; }
