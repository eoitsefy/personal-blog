import assert from "node:assert/strict";
import test from "node:test";
import { MediaValidationError, validateImageUpload } from "./image";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZsAAAAASUVORK5CYII=",
  "base64",
);

test("valid image metadata is derived from file contents", async () => {
  const result = await validateImageUpload(new File([PNG_1X1], "pixel.png", { type: "image/png" }));
  assert.equal(result.mime, "image/png");
  assert.equal(result.extension, "png");
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.equal(result.size, PNG_1X1.byteLength);
});

test("spoofed MIME types and extensions are rejected", async () => {
  await assert.rejects(
    validateImageUpload(new File([PNG_1X1], "pixel.jpg", { type: "image/jpeg" })),
    MediaValidationError,
  );
});

test("configured upload size limit is enforced", async () => {
  const previous = process.env.MAX_UPLOAD_BYTES;
  process.env.MAX_UPLOAD_BYTES = "8";
  try {
    await assert.rejects(
      validateImageUpload(new File([PNG_1X1], "pixel.png", { type: "image/png" })),
      MediaValidationError,
    );
  } finally {
    if (previous === undefined) delete process.env.MAX_UPLOAD_BYTES;
    else process.env.MAX_UPLOAD_BYTES = previous;
  }
});
