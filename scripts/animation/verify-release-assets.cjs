// Run inside the release container, with a manifest-derived expectation on stdin.
// Only immutable assistant assets are read. No environment or secrets are logged.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone .cjs deployment entrypoint in the production image. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
async function main() {
  const expected = JSON.parse(fs.readFileSync(0, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('release-motion-manifest.json', 'utf8'));
  assert.equal(expected.version, manifest.version);
  const complete = [...Object.values(manifest.assets), manifest.still].map(({src,sha256})=>({src,sha256}));
  assert.equal(new Set(complete.map(a=>a.src)).size, complete.length);
  assert.deepEqual(expected.assets, complete, 'Expected list must cover the exact complete release');
  assert(Array.isArray(expected.assets) && expected.assets.length > 0 && expected.assets.length < 100);
  for (const asset of expected.assets) {
    assert(/^\/assistant\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(asset.src));
    assert(/^[a-f0-9]{64}$/.test(asset.sha256));
    const bytes = fs.readFileSync(`public${asset.src}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const response = await fetch(`http://127.0.0.1:3000${asset.src}`, {signal:AbortSignal.timeout(10000)});
    assert.equal(response.status, 200);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), asset.sha256);
  }
  await require('sharp')({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
  console.log(`release_assets_verified=${expected.assets.length}`);
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
