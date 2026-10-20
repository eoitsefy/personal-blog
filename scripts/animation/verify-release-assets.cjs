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

function assertCurrentH3Release(manifest, kind) {
  const basic = ['idle-blink','wave','nod','thanks','thinking','cheer','yawn'];
  const mobile = kind === 'h3-mobile';
  assert.equal(manifest.version, mobile ? 'h3-motion-mobile-v5' : 'h3-motion-v7', 'Current seven-action release required');
  assert.deepEqual(Object.keys(manifest.clips), basic, 'Only seven current basic actions may ship');
  assert.deepEqual(Object.keys(manifest.stills), basic, 'Only seven current basic stills may ship');
  assert.equal(Object.keys(manifest.assets).length, 112, 'Complete seven-action atlas inventory required');
  assert.equal(manifest.release?.sceneClipsRemoved, true, 'Retired scenes must remain removed');
  assert.deepEqual(manifest.release?.replacedClips, basic.filter(name => name !== 'cheer'), 'Only the six requested mattes may change');
  const prefix = mobile ? '/assistant/h3-basics-rmbg2-mobile-v1/' : '/assistant/h3-basics-rmbg2-v1/';
  const cheerPrefix = mobile ? '/assistant/h3-cheer-rmbg2-mobile-v1/' : '/assistant/h3-cheer-rmbg2-v1/';
  for (const name of basic) {
    const expectedPrefix = name === 'cheer' ? cheerPrefix : prefix;
    for (const asset of [manifest.stills[name], ...manifest.clips[name].pages.map(key => manifest.assets[key])])
      assert(asset.src.startsWith(expectedPrefix), 'Unexpected or retired H3 resource URL');
  }
}

function assertMicrophoneDisabled(policy) {
  assert(policy && /(?:^|,)\s*microphone=\(\)\s*(?:,|$)/.test(policy), 'Production microphone permission must remain disabled');
}

function assertH3AssetCache(policy, src) {
  const directives = (policy ?? '').toLowerCase().split(',').map(value => value.trim());
  const ages = directives.filter(value => /^max-age\s*=/.test(value));
  assert(directives.includes('public') && directives.includes('immutable') &&
    ages.length === 1 && /^max-age\s*=\s*31536000$/.test(ages[0]) &&
    !directives.some(value => /^(?:private|no-cache|no-store)(?:\s*=|$)/.test(value)),
  `Asset cache policy must be public, max-age=31536000, immutable: ${src}`);
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
    if (expected.kind === 'h3' || expected.kind === 'h3-mobile') assertH3AssetCache(response.headers.get('cache-control'), asset.src);
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
  for (const release of releases) {
    if (release.kind === 'h3' || release.kind === 'h3-mobile')
      assertCurrentH3Release(JSON.parse(io.readFile(manifestFiles[release.kind], 'utf8')), release.kind);
    count += await verifyRelease(release, io);
  }
  console.log(`release_assets_verified=${count};releases=${releases.length};microphone=disabled`);
}
module.exports = {completeAssets, validateExpectation, assertMicrophoneDisabled, assertCurrentH3Release, verifyRelease};
if (require.main === module) main().catch(error => {console.error(error.message);process.exitCode=1;});
