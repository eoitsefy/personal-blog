import assert from "node:assert/strict";
import test from "node:test";
import { getMediaStorageQuotaBytes, mediaStorageStatus, wouldExceedMediaStorageQuota } from "./quota";

test("media storage status reports bounded remaining space and usage", () => {
  assert.deepEqual(mediaStorageStatus(25, 100), {
    usedBytes: 25,
    quotaBytes: 100,
    remainingBytes: 75,
    usagePercent: 25,
  });
  assert.equal(mediaStorageStatus(125, 100).remainingBytes, 0);
  assert.equal(mediaStorageStatus(125, 100).usagePercent, 100);
});

test("quota checks allow exact fits and reject overflow or invalid sizes", () => {
  assert.equal(wouldExceedMediaStorageQuota(75, 25, 100), false);
  assert.equal(wouldExceedMediaStorageQuota(75, 26, 100), true);
  assert.equal(wouldExceedMediaStorageQuota(0, -1, 100), true);
});

test("storage quota configuration has a safe default and cap", () => {
  const previous = process.env.MAX_MEDIA_STORAGE_BYTES;
  try {
    process.env.MAX_MEDIA_STORAGE_BYTES = "invalid";
    assert.equal(getMediaStorageQuotaBytes(), 2 * 1024 * 1024 * 1024);
    process.env.MAX_MEDIA_STORAGE_BYTES = String(2 * 1024 * 1024 * 1024 * 1024);
    assert.equal(getMediaStorageQuotaBytes(), 1024 * 1024 * 1024 * 1024);
  } finally {
    if (previous === undefined) delete process.env.MAX_MEDIA_STORAGE_BYTES;
    else process.env.MAX_MEDIA_STORAGE_BYTES = previous;
  }
});
