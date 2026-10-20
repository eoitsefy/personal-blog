import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import verifier from './verify-release-assets.cjs';

async function fixture(kind='h3-mobile') {
  const bytes = await sharp({create:{width:4,height:2,channels:4,background:'#f4c343'}}).webp().toBuffer();
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const asset = {src:'/assistant/h3-mobile-v2/idle-000.webp', sha256, width:4, height:2};
  const manifest = {version:'fixture-v2',width:4,height:2,assets:{idle:asset},stills:{}};
  const expected = {kind,version:manifest.version,assets:[{...asset,bytes:bytes.length}]};
  const io = {readFile:path => path.startsWith('public') ? bytes : JSON.stringify(manifest), metadata:buffer => sharp(buffer).metadata(), fetch:async () => new Response(bytes)};
  return {bytes,manifest,expected,io};
}

test('mobile uses its own runtime manifest and verifies dimensions plus HTTP bytes', async () => {
  const {expected,io} = await fixture();
  const paths=[]; const read=io.readFile; io.readFile=path => {paths.push(path);return read(path);};
  assert.equal(await verifier.verifyRelease(expected,io),1);
  assert.equal(paths[0],'release-h3-mobile-manifest.json');
});
test('stale version, omitted legacy asset, and mixed hashes fail', async () => {
  const {manifest,expected} = await fixture();
  assert.throws(() => verifier.validateExpectation({...expected,version:'stale'},manifest),/version/);
  assert.throws(() => verifier.validateExpectation({...expected,assets:[]},manifest),/exact complete/);
  assert.throws(() => verifier.validateExpectation({...expected,assets:[{...expected.assets[0],sha256:'0'.repeat(64)}]},manifest),/exact complete/);
});
test('correct hash cannot hide incorrect declared image dimensions', async () => {
  const {bytes,manifest,expected,io} = await fixture();
  manifest.assets.idle.width=8;
  delete expected.assets[0].width;
  io.readFile=path => path.startsWith('public') ? bytes : JSON.stringify(manifest);
  await assert.rejects(verifier.verifyRelease(expected,io),/width mismatch/);
});
test('HTTP bytes must match the same disk hash', async () => {
  const {expected,io} = await fixture();
  io.fetch=async () => new Response('stale CDN bytes');
  await assert.rejects(verifier.verifyRelease(expected,io),/HTTP SHA mismatch/);
});
test('path traversal and duplicate sources are rejected before reads', async () => {
  const {manifest,expected} = await fixture();
  const bad={...manifest,assets:{idle:{...manifest.assets.idle,src:'/assistant/../secret.webp'}}};
  assert.throws(() => verifier.validateExpectation({...expected,assets:[bad.assets.idle]},bad),/Invalid asset path/);
  manifest.assets.duplicate={...manifest.assets.idle};
  assert.throws(() => verifier.validateExpectation(expected,manifest),/Duplicate/);
});
test('microphone deny is explicit and rejects wildcard/self grants', () => {
  verifier.assertMicrophoneDisabled('camera=(), microphone=(), geolocation=()');
  for (const value of [null,'camera=()','microphone=*','microphone=(self)']) assert.throws(() => verifier.assertMicrophoneDisabled(value),/microphone/);
});
