import test from "node:test";
import assert from "node:assert/strict";
import { readUploadResponse } from "./upload-response";
test("upload errors distinguish proxy HTML, expiry and server validation", async () => {
  await assert.rejects(readUploadResponse(new Response("<html>too large</html>", { status: 413 })), /大小限制/);
  await assert.rejects(readUploadResponse(new Response("Bad gateway", { status: 502 })), /服务暂时不可用/);
  await assert.rejects(readUploadResponse(new Response("unauthorized", { status: 401 })), /登录已过期/);
  await assert.rejects(readUploadResponse(Response.json({ error: { message: "格式不允许" } }, { status: 400 })), /格式不允许/);
  const asset = { id: "video", kind: "VIDEO" };
  assert.deepEqual(await readUploadResponse(Response.json({ success: true, data: { asset } }, { status: 201 })), asset);
});
