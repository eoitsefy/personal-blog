import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MediaValidationError, validateImageUpload } from "./image";
import { PRIVATE_PHOTO_MARKER, privatePhotoFixture } from "@/test-support/image-privacy";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DQAAAEgQGADgLFJAAAAABJRU5ErkJggg==",
  "base64",
);

test("valid image metadata is derived from file contents", async () => {
  const result = await validateImageUpload(new File([PNG_1X1], "pixel.png", { type: "image/png" }));
  assert.equal(result.mime, "image/png");
  assert.equal(result.extension, "png");
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.equal(result.size, result.bytes.byteLength);
});

for (const [format, mime, extension] of [["jpeg", "image/jpeg", "jpg"], ["png", "image/png", "png"], ["webp", "image/webp", "webp"]] as const) {
  test(`${format} uploads remove private EXIF/XMP and apply orientation before storage`, async () => {
    const input = await privatePhotoFixture(format);
    const before = await sharp(input).metadata();
    assert.ok(before.exif && before.xmp && before.icc, "Fixture must contain actual metadata");
    assert.equal(before.orientation, 6);
    assert.ok(input.includes(Buffer.from(PRIVATE_PHOTO_MARKER)));
    const result = await validateImageUpload(new File([input], `photo.${extension}`, { type: mime }));
    const after = await sharp(result.bytes).metadata();
    for (const key of ["exif", "xmp", "iptc", "icc", "orientation"] as const) assert.equal(after[key], undefined);
    assert.equal(result.bytes.includes(Buffer.from(PRIVATE_PHOTO_MARKER)), false);
    assert.equal(result.mime, mime);
    assert.equal(after.format, format);
    assert.equal(result.width, 2);
    assert.equal(result.height, 3);
    assert.equal(after.width, result.width);
    assert.equal(after.height, result.height);
    assert.equal(result.size, result.bytes.byteLength);
  });
}

for (const format of ["png", "webp"] as const) {
  test(`${format} privacy cleaning preserves transparent pixels and the displayed image`, async () => {
    const input = await privatePhotoFixture(format);
    const result = await validateImageUpload(new File([input], `photo.${format}`, { type: `image/${format}` }));
    const actual = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
    // The 3x2 fixture rotated 90 degrees clockwise, including alpha values.
    assert.deepEqual(actual, Buffer.from([
      255, 255, 0, 255, 255, 0, 0, 255,
      0, 255, 255, 64, 0, 255, 0, 128,
      255, 0, 255, 255, 0, 0, 255, 0,
    ]));
  });
}

test("a readable image header cannot hide corrupt pixel data", async () => {
  const broken = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZsAAAAASUVORK5CYII=", "base64");
  assert.equal((await sharp(broken).metadata()).width, 1);
  await assert.rejects(validateImageUpload(new File([broken], "broken.png", { type: "image/png" })), MediaValidationError);
});

test("privacy cleaning keeps 16-bit PNG channel precision", async () => {
  const input = await sharp(new Uint16Array([0, 32768, 65535, 1234, 4567, 23456]), {
    raw: { width: 2, height: 1, channels: 3 },
  }).toColourspace("rgb16").png().toBuffer();
  assert.equal((await sharp(input).metadata()).depth, "ushort");
  const result = await validateImageUpload(new File([input], "precise.png", { type: "image/png" }));
  assert.equal((await sharp(result.bytes).metadata()).depth, "ushort");
  const raw = (bytes: Buffer) => sharp(bytes).toColourspace("rgb16").raw({ depth: "ushort" }).toBuffer();
  assert.deepEqual(await raw(result.bytes), await raw(input));
});

test("mirrored EXIF photos retain the displayed direction", async () => {
  const input = await privatePhotoFixture("png", 2);
  const result = await validateImageUpload(new File([input], "mirror.png", { type: "image/png" }));
  assert.equal(result.width, 3);
  assert.equal(result.height, 2);
  assert.deepEqual(await sharp(result.bytes).ensureAlpha().raw().toBuffer(), Buffer.from([
    0, 0, 255, 0, 0, 255, 0, 128, 255, 0, 0, 255,
    255, 0, 255, 255, 0, 255, 255, 64, 255, 255, 0, 255,
  ]));
});

test("animated WebP cannot be silently flattened during privacy cleaning", async () => {
  const input = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), {
    raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
  }).webp({ lossless: true, delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(input).metadata()).pages, 2);
  await assert.rejects(validateImageUpload(new File([input], "animated.webp", { type: "image/webp" })), MediaValidationError);
});

test("the processed image must also fit the upload byte limit", async () => {
  const pixels = Buffer.alloc(128 * 128 * 3);
  let seed = 12345;
  for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
  const input = await sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } }).jpeg({ quality: 5 }).toBuffer();
  const previous = process.env.MAX_UPLOAD_BYTES;
  process.env.MAX_UPLOAD_BYTES = String(input.byteLength);
  try {
    await assert.rejects(validateImageUpload(new File([input], "small.jpg", { type: "image/jpeg" })), MediaValidationError);
  } finally {
    if (previous === undefined) delete process.env.MAX_UPLOAD_BYTES;
    else process.env.MAX_UPLOAD_BYTES = previous;
  }
});

test("spoofed MIME types and extensions are rejected", async () => {
  await assert.rejects(
    validateImageUpload(new File([PNG_1X1], "pixel.jpg", { type: "image/jpeg" })),
    MediaValidationError,
  );
  await assert.rejects(validateImageUpload(new File([PNG_1X1], "pixel.jpg", { type: "image/png" })), MediaValidationError);
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
