import test from "node:test";
import assert from "node:assert/strict";
import { parseByteRange } from "./byte-range";
test("video seeking handles normal, suffix, open and invalid ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.deepEqual(parseByteRange("bytes=5-999", 100), { start: 5, end: 99 });
  for (const value of ["bytes=-0", "bytes=100-", "bytes=10-5", "bytes=", "bytes=0-1,5-9", "bytes=999999999999999999999-"]) assert.equal(parseByteRange(value, 100), null);
});
