import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { CHARACTER_STAGE, type CharacterAction } from "./character";
import { DRAWING_SEQUENCES, FRAME_INTERVAL_MS, FRAME_BLEND_MS, NEUTRAL_DRAWING, RUNTIME_SHEETS, drawingDuration, isPilotAction, drawingKey, drawingPose, drawingSample, drawingTimes } from "./frame-timeline";

test("selected whole-figure timelines share an exact original neutral, excluding bad/redundant recovery frames", () => {
  const sources = new Set<string>();
  for (const action of Object.keys(DRAWING_SEQUENCES) as CharacterAction[]) {
    const sequence = DRAWING_SEQUENCES[action];
    assert.deepEqual(sequence[0], NEUTRAL_DRAWING);
    assert.deepEqual(sequence.at(-1), NEUTRAL_DRAWING);
    const keys = sequence.map(drawingKey);
    assert.equal(new Set(keys).size, sequence.length - 1, "Only the shared neutral may appear twice");
    for (const pose of sequence) {
      sources.add(drawingKey(pose));
      assert.ok(pose.frame < RUNTIME_SHEETS[pose.sheet].poses.length);
      if (pose.sheet === "thinking") assert.ok(pose.frame < 14, "Undersized row and abrupt lowering are excluded");
      if (pose.sheet === "yawn") assert.ok(pose.frame < 20, "Abrupt hand drop is replaced by recovery drawings");
    }
  }
  assert.equal(sources.size, 205); // Drawing addresses, not independently drawn poses.
});

test("breath uses 15 fps and blink uses 30 fps without geometric blends", () => {
  assert.equal(FRAME_INTERVAL_MS, 1000 / 15);
  assert.ok(FRAME_BLEND_MS < FRAME_INTERVAL_MS / 2);
  for (const action of Object.keys(DRAWING_SEQUENCES) as CharacterAction[]) {
    const times = drawingTimes(action), duration = drawingDuration(action);
    assert.equal(times[0], 0); assert.ok(times.at(-1)! < duration);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] > times[i - 1]);
      if (i > 1) {
        const delta = times[i] - times[i - 1];
        assert.ok(Math.abs(delta - FRAME_INTERVAL_MS) < 1e-8 || (action === "idle" && Math.abs(delta - 1000 / 30) < 1e-8));
      }
      const start = times[i];
      assert.deepEqual(drawingSample(action, start + FRAME_BLEND_MS).to, DRAWING_SEQUENCES[action][i]);
      if (isPilotAction(action)) {
        const sample = drawingSample(action, start + FRAME_BLEND_MS / 2);
        assert.equal(sample.mix, 1); assert.deepEqual(sample.from, sample.to);
      } else assert.ok(Math.abs(drawingSample(action, start + FRAME_BLEND_MS / 2).mix - .5) < 1e-8);
    }
    assert.deepEqual(drawingSample(action, duration), {from:NEUTRAL_DRAWING,to:NEUTRAL_DRAWING,mix:1});
  }
});

test("selected crops retain edge padding without redefining the solid-sole anchor or changing sheet scale", async () => {
  for (const [key, sheet] of Object.entries(RUNTIME_SHEETS)) {
    const selected = [...new Set(Object.values(DRAWING_SEQUENCES).flat().filter(p => p.sheet === key).map(p => p.frame))];
    const {data, info} = await sharp(`public${sheet.src}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for (const index of selected) {
      const drawing = {sheet:key as keyof typeof RUNTIME_SHEETS,frame:index}, pose = drawingPose(drawing);
      const [x,y,right,bottom,anchorX,anchorY] = sheet.poses[index];
      assert.ok(x >= 0 && y >= 0 && right < info.width && bottom < info.height);
      assert.ok(Math.abs(pose.left + (anchorX - x) * sheet.scale - CHARACTER_STAGE.centre) < 1e-8);
      assert.ok(Math.abs(pose.top + (anchorY - y) * sheet.scale - CHARACTER_STAGE.baseline) < 1e-8);
      assert.ok(pose.left >= 8 && pose.top >= 6 && pose.left + pose.drawWidth < 216 && pose.top + pose.drawHeight < 219);
      let l: number=right,r: number=x,solidBottom: number=y;
      for(let py=y;py<=bottom;py++)for(let px=x;px<=right;px++)if(data[(py*info.width+px)*4+3]>100)solidBottom=Math.max(solidBottom,py);
      const band=Math.round((solidBottom-y-1)*.13);
      for(let py=solidBottom-band+1;py<=solidBottom;py++)for(let px=x;px<=right;px++)if(data[(py*info.width+px)*4+3]>100){l=Math.min(l,px);r=Math.max(r,px);}
      if (!key.startsWith("pilot-")) {
        assert.equal(anchorY, solidBottom + 1);
        assert.equal(anchorX, (l+r)/2);
      } else {
        assert.ok(Math.abs(anchorY - solidBottom - 1) <= 1);
        assert.ok(Math.abs(anchorX - (l+r)/2) <= 1);
      }
      for(const py of [y,bottom])for(let px=x;px<=right;px++)assert.ok(data[(py*info.width+px)*4+3]<=100,"A neighbouring row leaked into padded crop");
      for(const px of [x,right])for(let py=y;py<=bottom;py++)assert.ok(data[(py*info.width+px)*4+3]<=100,"A neighbouring column leaked into padded crop");
    }
  }
});
