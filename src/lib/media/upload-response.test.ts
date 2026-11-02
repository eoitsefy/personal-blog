import test from "node:test";
import assert from "node:assert/strict";
import { MAX_VIDEO_UPLOAD_BYTES } from "./upload-limits";
import { readUploadResponse } from "./upload-response";
test("upload errors distinguish proxy HTML, expiry and server validation", async () => {
  await assert.rejects(readUploadResponse(new Response("<html>too large</html>", { status: 413 })), /视频最多 1 GiB，其他文件的限制可能更低/);
  await assert.rejects(readUploadResponse(new Response("Bad gateway", { status: 502 })), /服务暂时不可用/);
  await assert.rejects(readUploadResponse(new Response("unauthorized", { status: 401 })), /登录已过期/);
  await assert.rejects(readUploadResponse(Response.json({ error: { message: "格式不允许" } }, { status: 400 })), /格式不允许/);
  const asset = { id: "video", kind: "VIDEO" };
  assert.deepEqual(await readUploadResponse(Response.json({ success: true, data: { asset } }, { status: 201 })), asset);
});

test("video limit admits 896 MiB and caps at 1 GiB", () => {
  assert.equal(MAX_VIDEO_UPLOAD_BYTES, 1024 ** 3);
  assert.ok(896 * 1024 ** 2 < MAX_VIDEO_UPLOAD_BYTES);
});
