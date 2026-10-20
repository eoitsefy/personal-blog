import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import verifier from './verify-release-assets.cjs';

const immutableHeaders = {'Cache-Control':'public, max-age=31536000, immutable'};

async function fixture(kind='h3-mobile') {
  const bytes = await sharp({create:{width:4,height:2,channels:4,background:'#f4c343'}}).webp().toBuffer();
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const asset = {src:'/assistant/h3-mobile-v2/idle-000.webp', sha256, width:4, height:2};
  const manifest = {version:'fixture-v2',width:4,height:2,...(kind === 'natural' ? {assets:{},still:asset} : {assets:{idle:asset},stills:{}})};
  const expected = {kind,version:manifest.version,assets:[{...asset,bytes:bytes.length}]};
  const io = {readFile:path => path.startsWith('public') ? bytes : JSON.stringify(manifest), metadata:buffer => sharp(buffer).metadata(), fetch:async () => new Response(bytes,{headers:immutableHeaders})};
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
  io.fetch=async () => new Response('stale CDN bytes',{headers:immutableHeaders});
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

test('desktop and mobile assets reject missing long-cache directives', async () => {
  for (const kind of ['h3','h3-mobile']) {
    const {bytes,expected,io} = await fixture(kind);
    for (const policy of [null,'public, max-age=31536000','max-age=31536000, immutable']) {
      io.fetch=async () => new Response(bytes,{headers:policy ? {'Cache-Control':policy} : {}});
      await assert.rejects(verifier.verifyRelease(expected,io),/Asset cache policy/);
    }
  }
});
test('desktop and mobile reject short, conflicting, or private caches', async () => {
  for (const kind of ['h3','h3-mobile']) {
    const {bytes,expected,io} = await fixture(kind);
    for (const policy of ['public, max-age=0, immutable','public, max-age=3600, immutable','public, max-age=31536000, max-age=0, immutable','public, max-age=31536000, immutable, private','public, max-age=31536000, immutable, no-store','public, max-age=31536000, immutable, no-cache']) {
      io.fetch=async () => new Response(bytes,{headers:{'Cache-Control':policy}});
      await assert.rejects(verifier.verifyRelease(expected,io),/Asset cache policy/);
    }
    assert.equal(await verifier.verifyRelease(expected,{...io,fetch:async () => new Response(bytes,{headers:immutableHeaders})}),1);
  }
});
test('natural assets retain their existing cache boundary', async () => {
  const {bytes,expected,io} = await fixture('natural');
  io.fetch=async () => new Response(bytes,{headers:{'Cache-Control':'public, max-age=0'}});
  assert.equal(await verifier.verifyRelease(expected,io),1);
});


test('production release verifier rejects retired scenes and old H3 versions before media checks', () => {
  for (const [kind, directory] of [['h3','h3-v7'],['h3-mobile','h3-mobile-v5']]) {
    const manifest = JSON.parse(readFileSync(`src/lib/assistant/releases/${directory}/manifest.json`, 'utf8'));
    verifier.assertCurrentH3Release(manifest, kind);
    const stale = structuredClone(manifest); stale.version = 'h3-motion-v4';
    assert.throws(() => verifier.assertCurrentH3Release(stale, kind), /Current seven-action/);
    const scenes = structuredClone(manifest); scenes.clips['bed-pull'] = scenes.clips.wave;
    assert.throws(() => verifier.assertCurrentH3Release(scenes, kind), /Only seven/);
    const oldUrl = structuredClone(manifest); Object.values(oldUrl.assets)[0].src = '/assistant/h3-v2/bed-pull-000.webp';
    assert.throws(() => verifier.assertCurrentH3Release(oldUrl, kind), /retired H3/);
  }
});
