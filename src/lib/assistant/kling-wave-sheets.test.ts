import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {KLING_WAVE_SHEETS} from "./kling-wave-sheets";
import {DRAWING_SEQUENCES, RUNTIME_SHEETS, drawingDuration, drawingSample, drawingTimes, NEUTRAL_DRAWING} from "./frame-timeline";
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

test("only the owner-accepted wave uses Kling; the bow-like nod trial is not released", async () => {
  const m = JSON.parse(await readFile("docs/assistant/kling-wave-v1/manifest.json", "utf8"));
  assert.deepEqual(m.ownerAcceptance.scope, ["wave"]);
  assert.equal(m.ownerAcceptance.otherActionsAuthorized, false);
  assert.equal(m.ownerAcceptance.extraBlinkAccepted, true);
  assert.equal(m.source.videoSha256, "0f1495e856a10445ef705c57bb4faf974925a1b5868b0184a6aaa3218c6b911e");
  assert.equal(m.source.originalAigcMetadataRetained, true);
  assert.equal(m.processing.limbCompositing, false);
  assert.equal(m.processing.interpolation, false);
  assert.equal(m.processing.alphaLossless, true);
  assert.ok(m.processing.maxOpaqueRgbMeanError <= 3);
  assert.equal(RUNTIME_SHEETS.nod.src, "/assistant/chibi-nod-left-collar-v5.webp");
  assert.equal(RUNTIME_SHEETS.bow.src, "/assistant/chibi-bow-left-collar-v5.webp");
  assert.equal(RUNTIME_SHEETS["pilot-blink"].src, "/assistant/chibi-idle-blink-refined-v1.webp");
  const assets = [m.asset, ...Object.values(m.keptAssets)] as {src:string;sha256:string;bytes:number}[];
  for (const a of assets) {
    const b = await readFile("public" + a.src); assert.equal(b.length, a.bytes); assert.equal(hash(b), a.sha256);
  }
  assert.equal(m.assetScopeSha256, hash(assets.map(a => a.src+":"+a.sha256).sort().join("\n")));
});

test("native 24fps timing has exact canonical endpoints and no inter-frame ghost blending", () => {
  assert.equal(DRAWING_SEQUENCES.wave.length, 121);
  assert.equal(drawingDuration("wave"), 121/24*1000);
  for (const [i, time] of drawingTimes("wave").entries()) {
    assert.equal(time, i*1000/24);
    const sample = drawingSample("wave", time+1);
    assert.equal(sample.mix, 1); assert.deepEqual(sample.from, sample.to);
    assert.deepEqual(sample.to, DRAWING_SEQUENCES.wave[i]);
  }
  assert.deepEqual(DRAWING_SEQUENCES.wave[0], NEUTRAL_DRAWING);
  assert.deepEqual(DRAWING_SEQUENCES.wave.at(-1), NEUTRAL_DRAWING);
});

test("compressed static atlas has hash-bound frames, transparent gutters and AI source provenance", async () => {
  const m = JSON.parse(await readFile("docs/assistant/kling-wave-v1/manifest.json", "utf8"));
  const sheet = KLING_WAVE_SHEETS["kling-wave"], bytes = await readFile("public"+sheet.src);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, sheet.width); assert.equal(metadata.height, sheet.height);
  assert.equal(metadata.pages ?? 1, 1); assert.equal(metadata.hasAlpha, true);
  assert.match(metadata.xmp!.toString(), /HB1_PROD_ai_web_323375346120805/);
  assert.ok(bytes.length < 2*1024*1024, "Wave download exceeds the mobile budget");
  const data = await sharp(bytes).ensureAlpha().raw().toBuffer();
  for (let i=0;i<121;i++) {
    const tile=Buffer.alloc(244*308*4), [x,y] = sheet.poses[i];
    for(let row=0;row<308;row++) {
      const start=((y+row)*sheet.width+x)*4;
      data.copy(tile,row*244*4,start,start+244*4);
    }
    assert.equal(hash(tile), m.frames[i].tileRgbaSha256);
    for(let px=0;px<244;px++)for(const py of [0,307])assert.equal(tile[(py*244+px)*4+3],0);
    for(let py=0;py<308;py++)for(const px of [0,243])assert.equal(tile[(py*244+px)*4+3],0);
  }
  assert.equal(hash(m.frames.map((f:{tileRgbaSha256:string})=>f.tileRgbaSha256).join("")),m.frameScopeSha256);
});
