import assert from "node:assert/strict";
import test from "node:test";
import { validateAudioUpload } from "./audio";
import { MediaValidationError } from "./image";

function pcmWav() {
  const dataSize = 8_000;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(8_000, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

test("WAV metadata is derived from validated PCM headers", async () => {
  const result = await validateAudioUpload(new File([pcmWav()], "note.wav", { type: "audio/wav" }));
  assert.equal(result.kind, "AUDIO");
  assert.equal(result.mime, "audio/wav");
  assert.equal(result.extension, "wav");
  assert.equal(result.durationMs, 1000);
});

test("spoofed audio MIME types and extensions are rejected", async () => {
  await assert.rejects(
    validateAudioUpload(new File([pcmWav()], "note.mp3", { type: "audio/mpeg" })),
    MediaValidationError,
  );
  await assert.rejects(
    validateAudioUpload(new File([Buffer.from("not audio")], "note.mp3", { type: "audio/mpeg" })),
    MediaValidationError,
  );
});

test("MP3 audio frames are accepted after an ID3 header", async () => {
  const bytes = Buffer.alloc(64);
  bytes.write("ID3", 0, "ascii");
  bytes[3] = 4;
  bytes.set([0xff, 0xfb, 0x90, 0x64], 10);
  const result = await validateAudioUpload(new File([bytes], "note.mp3", { type: "audio/mpeg" }));
  assert.equal(result.mime, "audio/mpeg");
  assert.equal(result.extension, "mp3");
});

test("Opus-in-Ogg pages are recognized from their structured header", async () => {
  const payload = Buffer.from("OpusHead\x01\x02\x03\x04", "binary");
  const bytes = Buffer.alloc(28 + payload.length);
  bytes.write("OggS", 0, "ascii");
  bytes[4] = 0;
  bytes[26] = 1;
  bytes[27] = payload.length;
  payload.copy(bytes, 28);
  const result = await validateAudioUpload(new File([bytes], "note.opus", { type: "audio/ogg" }));
  assert.equal(result.mime, "audio/ogg");
  assert.equal(result.extension, "opus");
});
