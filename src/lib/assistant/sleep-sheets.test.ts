import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { SLEEP_ART_VERSION, SLEEP_FPS, SLEEP_LOOP, SLEEP_SHEETS } from "./sleep-sheets";
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

test("sleep and wake retain all native whole-frame positions and a closed-eye loop", async () => {
  const m = JSON.parse(await readFile("docs/assistant/sleep-bed-v2/manifest.json", "utf8"));
  assert.equal(SLEEP_ART_VERSION, m.version);
  assert.equal(SLEEP_FPS, 24);
  assert.equal(m.processing.wholeFrame, true);
  for (const flag of ["geometryEdits", "limbCompositing", "interpolation"]) assert.equal(m.processing[flag], false);
  assert.equal(m.processing.alphaLossless, true);
  assert.deepEqual(m.processing.fixedCanvas, [960, 960]);
  assert.equal(m.processing.uniformScale, .5);
  assert.deepEqual(m.assets, SLEEP_SHEETS);
  assert.deepEqual(m.loop.indices, SLEEP_LOOP);
  assert.equal(SLEEP_LOOP.length, 96);
  assert.equal(SLEEP_LOOP[0], 192);
  assert.equal(SLEEP_LOOP.at(-1), 191);
  assert.ok(SLEEP_LOOP.every(i => i >= 144 && i <= 192));
  assert.deepEqual(m.credits, { additionalGeneration: 0, additionalSpend: 0 });
  for (const [action, count] of [["enter", 193], ["wake", 121]] as const) {
    assert.equal(m.clips[action].fps, 24);
    assert.equal(m.clips[action].durationMs, count/24*1000);
    assert.deepEqual(m.clips[action].frames.map((f: {sourceIndex: number}) => f.sourceIndex), Array.from({length: count}, (_, i) => i));
  }
  for (const [file, field] of [["refine-kling-sleep-alpha.py", "recipeSha256"], ["matte-kling-sleep-birefnet.py", "semanticRecipeSha256"], ["prepare-kling-sleep.py", "exteriorRecipeSha256"]]) {
    assert.equal(hash(await readFile("scripts/animation/"+file)), m.processing[field]);
  }
});

test("paged sleep artwork is hash-bound with lossless alpha and bounded bitmap pages", async () => {
  const m = JSON.parse(await readFile("docs/assistant/sleep-bed-v2/manifest.json", "utf8"));
  const scopes: string[] = [], frameScopes: string[] = [];
  for (const action of ["enter", "wake"] as const) {
    const config = SLEEP_SHEETS[action];
    assert.equal(config.pageFrames, 24);
    for (const page of config.pages) {
      const bytes = await readFile("public"+page.src), meta = await sharp(bytes).metadata();
      assert.equal(hash(bytes), page.sha256);
      assert.equal(bytes.length, page.bytes);
      assert.ok(bytes.length < 1024*1024);
      assert.equal(meta.width, page.width); assert.equal(meta.height, page.height);
      assert.ok(page.width*page.height*4 <= 22_118_400);
      assert.equal(meta.hasAlpha, true); assert.equal(meta.pages ?? 1, 1);
      assert.match(meta.xmp!.toString(), /AI-generated with Kling Video 3.0/);
      const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();
      for (let k=0; k<page.frames; k++) {
        const tile = Buffer.alloc(480*480*4);
        for (let y=0; y<480; y++) {
          const begin = ((Math.floor(k/4)*480+y)*page.width+k%4*480)*4;
          raw.copy(tile, y*480*4, begin, begin+480*4);
        }
        assert.equal(hash(tile), m.clips[action].frames[page.start+k].tileRgbaSha256);
        for (let x=0; x<480; x++) for (const y of [0, 479]) assert.equal(tile[(y*480+x)*4+3], 0);
        frameScopes.push(action+":"+hash(tile));
      }
      scopes.push(page.src+":"+hash(bytes));
    }
  }
  assert.equal(hash(scopes.sort().join("\n")), m.assetScopeSha256);
  assert.equal(hash(frameScopes.join("\n")), m.frameScopeSha256);
});
