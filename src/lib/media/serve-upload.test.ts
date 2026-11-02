import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET, HEAD } from "../../app/uploads/[...path]/route";
import { LocalStorageAdapter } from "../storage/local";

test("large public files use streaming HEAD and byte ranges, never storage.read", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "serve-video-"));
  const previous = process.env.UPLOAD_ROOT;
  const read = LocalStorageAdapter.prototype.read;
  process.env.UPLOAD_ROOT = root;
  LocalStorageAdapter.prototype.read = async () => { throw new Error("Full-buffer read must not be used"); };
  try {
    await mkdir(path.join(root, "media"));
    const file = await open(path.join(root, "media/large.mp4"), "w");
    try {
      await file.write(Buffer.from("first-bytes"));
      await file.truncate(1024 ** 3);
      await file.write(Buffer.from("last-bytes"), 0, 10, 1024 ** 3 - 10);
    } finally { await file.close(); }
    const context = { params: Promise.resolve({ path: ["media", "large.mp4"] }) };
    const head = await HEAD(new Request("http://localhost/uploads/media/large.mp4", { method: "HEAD" }), context);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), String(1024 ** 3));
    assert.equal(head.body, null);
    for (const [range, expected] of [["bytes=0-10", "first-bytes"], ["bytes=-10", "last-bytes"]]) {
      const response = await GET(new Request("http://localhost/uploads/media/large.mp4", { headers: { range } }), context);
      assert.equal(response.status, 206);
      assert.equal(await response.text(), expected);
    }
    const invalid = await GET(new Request("http://localhost/uploads/media/large.mp4", { headers: { range: `bytes=${1024 ** 3}-` } }), context);
    assert.equal(invalid.status, 416);
    await writeFile(path.join(root, "media/small.txt"), "document");
    const doc = await GET(new Request("http://localhost/uploads/media/small.txt"), { params: Promise.resolve({ path: ["media", "small.txt"] }) });
    assert.equal(await doc.text(), "document");
    assert.equal(doc.headers.get("content-disposition"), "attachment");
    assert.equal(doc.headers.get("content-security-policy"), "sandbox");
    const traversal = await GET(new Request("http://localhost/uploads/escape"), { params: Promise.resolve({ path: ["..", "secret.mp4"] }) });
    assert.equal(traversal.status, 404);
  } finally {
    LocalStorageAdapter.prototype.read = read;
    if (previous === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
