import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSafeStorageKey, createAssetKey, LocalStorageAdapter, publicAssetUrl } from "./local";

test("local storage writes, reads and deletes within its root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-media-"));
  const storage = new LocalStorageAdapter(root);
  const key = "media/2026/07/test.png";
  try {
    await storage.write(key, Buffer.from("image-bytes"));
    assert.equal((await storage.read(key)).toString(), "image-bytes");
    await storage.delete(key);
    await assert.rejects(storage.read(key));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("storage keys cannot escape the upload root", () => {
  assert.throws(() => assertSafeStorageKey("../secret.png"));
  assert.throws(() => assertSafeStorageKey("media\\secret.png"));
  assert.equal(publicAssetUrl("media/2026/07/photo.webp"), "/uploads/media/2026/07/photo.webp");
  assert.match(createAssetKey("jpg", new Date("2026-07-16T00:00:00Z")), /^media\/2026\/07\/[a-f0-9]{32}\.jpg$/);
  assert.match(createAssetKey("mp3", new Date("2026-07-16T00:00:00Z")), /^media\/2026\/07\/[a-f0-9]{32}\.mp3$/);
  assert.match(createAssetKey("pdf", new Date("2026-07-16T00:00:00Z")), /^media\/2026\/07\/[a-f0-9]{32}\.pdf$/);
  assert.doesNotThrow(() => assertSafeStorageKey("media/2026/07/field-recording.opus"));
  assert.doesNotThrow(() => assertSafeStorageKey("media/2026/07/daily-note.md"));
});

test("writeFromFile copies data and preserves an existing destination on collision", async () => {
  const { writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-copy-"));
  const storage = new LocalStorageAdapter(root); const source = path.join(root, "source");
  try {
    await writeFile(source, Buffer.from("streamed content"));
    await storage.writeFromFile("media/2026/07/copy.mp4", source);
    assert.equal((await storage.read("media/2026/07/copy.mp4")).toString(), "streamed content");
    await assert.rejects(storage.writeFromFile("media/2026/07/copy.mp4", source));
    assert.equal((await storage.read("media/2026/07/copy.mp4")).toString(), "streamed content");
    await assert.rejects(storage.writeFromFile("../escape.mp4", source));
    await assert.rejects(storage.writeFromFile("media/2026/07/missing.mp4", path.join(root, "missing")));
    await assert.rejects(storage.read("media/2026/07/missing.mp4"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
