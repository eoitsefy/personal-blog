import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateAssetUpload } from "./upload";
import { getMaxVideoUploadBytes, validateVideoUpload } from "./video-upload";

const fixture = (ext: string) => readFileSync(`src/integration/fixtures/video.${ext}`);
test("real MP4, MOV and WebM containers upload with video metadata", async () => {
  for (const [extension, mime] of [["mp4", "video/mp4"], ["mov", "video/quicktime"], ["webm", "video/webm"]]) {
    const result = await validateAssetUpload(new File([fixture(extension)], `clip.${extension}`, { type: mime }));
    assert.equal(result.kind, "VIDEO"); assert.equal(result.mime, mime);
    assert.equal(result.width, 64); assert.equal(result.height, 48);
    assert.equal(result.extension, extension);
  }
});
test("video validation rejects renamed scripts, truncated containers and MIME mismatches", async () => {
  for (const file of [
    new File(["<script>alert(1)</script>"], "fake.mp4", { type: "video/mp4" }),
    new File([fixture("mp4").subarray(0, 100)], "broken.mp4", { type: "video/mp4" }),
    new File([fixture("mp4")], "wrong.webm", { type: "video/webm" }),
    new File([fixture("mp4")], "wrong.mp4", { type: "text/html" }),
    new File([fixture("webm").subarray(0, 90)], "broken.webm", { type: "video/webm" }),
  ]) await assert.rejects(validateAssetUpload(file));
  const result = await validateVideoUpload(new File([fixture("mp4")], "phone.mp4", { type: "application/octet-stream" }));
  assert.equal(result.kind, "VIDEO");
});
test("video limits are bounded and enforced before reading the file", async () => {
  const previous = process.env.MAX_VIDEO_UPLOAD_BYTES;
  try {
    process.env.MAX_VIDEO_UPLOAD_BYTES = "100";
    await assert.rejects(validateVideoUpload(new File([fixture("mp4")], "big.mp4", { type: "video/mp4" })), /超过/);
    process.env.MAX_VIDEO_UPLOAD_BYTES = "999999999";
    assert.equal(getMaxVideoUploadBytes(), 64 * 1024 * 1024);
  } finally { if (previous === undefined) delete process.env.MAX_VIDEO_UPLOAD_BYTES; else process.env.MAX_VIDEO_UPLOAD_BYTES = previous; }
});
