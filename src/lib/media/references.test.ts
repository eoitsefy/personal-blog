import assert from "node:assert/strict";
import test from "node:test";
import { extractLocalAssetUrls } from "./references";

test("local media URLs are extracted and deduplicated from Markdown", () => {
  const url = "/uploads/media/2026/07/0123456789abcdef0123456789abcdef.png";
  assert.deepEqual(extractLocalAssetUrls(`![cover](${url})\n\n${url}`), [url]);
});

test("external and unsafe upload paths are ignored", () => {
  assert.deepEqual(extractLocalAssetUrls("https://example.com/image.png"), []);
  assert.deepEqual(extractLocalAssetUrls("/uploads/../secret.png"), []);
});

test("local audio references are tracked like image references", () => {
  const url = "/uploads/media/2026/07/0123456789abcdef0123456789abcdef.ogg";
  assert.deepEqual(extractLocalAssetUrls(`[audio:field recording](${url})`), [url]);
});
