// Run inside the release container; stdin is derived from the source release manifests.
// Only immutable assets and response headers are read. No environment/secrets are logged.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone production .cjs entrypoint. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const manifestFiles = Object.freeze({h3:'release-h3-manifest.json', 'h3-mobile':'release-h3-mobile-manifest.json', natural:'release-motion-manifest.json'});
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function completeAssets(manifest, kind) {
  const h3 = kind === 'h3' || kind === 'h3-mobile';
  return [...Object.values(manifest.assets), ...(h3 ? Object.values(manifest.stills) : [manifest.still])].map(asset => ({
    src:asset.src, sha256:asset.sha256,
    width:asset.width ?? manifest.width, height:asset.height ?? manifest.height,
  }));
}

function validateExpectation(expected, manifest) {
  assert(Object.hasOwn(manifestFiles, expected.kind), 'Unknown release kind');
  assert.equal(expected.version, manifest.version, 'Release version mismatch');
  const complete = completeAssets(manifest, expected.kind);
  assert(complete.length > 0 && complete.length < (expected.kind === 'natural' ? 100 : 1024));
  assert.equal(new Set(complete.map(asset => asset.src)).size, complete.length, 'Duplicate manifest src');
  assert(Array.isArray(expected.assets), 'Expected complete asset list required');
  assert.deepEqual(expected.assets.map(({src,sha256}) => ({src,sha256})), complete.map(({src,sha256}) => ({src,sha256})), 'Expected list must cover the exact complete release');
  for (let i=0; i<complete.length; i++) {
    const asset = complete[i];
    assert(/^\/assistant\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(asset.src), 'Invalid asset path');
    assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'Invalid asset SHA256');
    assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, 'Missing manifest dimensions');
    if (expected.assets[i].width !== undefined) assert.equal(expected.assets[i].width, asset.width);
    if (expected.assets[i].height !== undefined) assert.equal(expected.assets[i].height, asset.height);
    if (expected.assets[i].bytes !== undefined) assert(Number.isSafeInteger(expected.assets[i].bytes) && expected.assets[i].bytes > 0);
  }
  return complete;
}

function assertMicrophoneDisabled(policy) {
  assert(policy && /(?:^|,)\s*microphone=\(\)\s*(?:,|$)/.test(policy), 'Production microphone permission must remain disabled');
}

async function verifyRelease(expected, io) {
  const filename = manifestFiles[expected.kind];
  assert(filename, 'Unknown release kind');
  const complete = validateExpectation(expected, JSON.parse(io.readFile(filename, 'utf8')));
  for (let i=0; i<complete.length; i++) {
    const asset = complete[i];
    const bytes = io.readFile(`public${asset.src}`);
    assert.equal(sha256(bytes), asset.sha256, `Disk SHA mismatch: ${asset.src}`);
    if (expected.assets[i].bytes !== undefined) assert.equal(bytes.length, expected.assets[i].bytes, `Disk length mismatch: ${asset.src}`);
    const metadata = await io.metadata(bytes);
    assert.equal(metadata.format, 'webp', `Asset format mismatch: ${asset.src}`);
    assert.equal(metadata.width, asset.width, `Asset width mismatch: ${asset.src}`);
    assert.equal(metadata.height, asset.height, `Asset height mismatch: ${asset.src}`);
    const response = await io.fetch(`http://127.0.0.1:3000${asset.src}`, {signal:AbortSignal.timeout(10000)});
    assert.equal(response.status, 200, `Asset HTTP status: ${asset.src}`);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), asset.sha256, `HTTP SHA mismatch: ${asset.src}`);
  }
  return complete.length;
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const releases = input.releases ?? [input];
  if (input.releases) assert.deepEqual(releases.map(release => release.kind).sort(), ['h3', 'h3-mobile'], 'Dual release must contain exactly desktop and mobile');
  const sharp = require('sharp');
  const io = {readFile:fs.readFileSync, fetch, metadata:bytes => sharp(bytes).metadata()};
  const page = await fetch('http://127.0.0.1:3000/', {signal:AbortSignal.timeout(10000)});
  assert.equal(page.status, 200);
  assertMicrophoneDisabled(page.headers.get('permissions-policy'));
  let count = 0;
  for (const release of releases) count += await verifyRelease(release, io);
  console.log(`release_assets_verified=${count};releases=${releases.length};microphone=disabled`);
}
module.exports = {completeAssets, validateExpectation, assertMicrophoneDisabled, verifyRelease};
if (require.main === module) main().catch(error => {console.error(error.message);process.exitCode=1;});
