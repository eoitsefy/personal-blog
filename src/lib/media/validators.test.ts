import assert from "node:assert/strict";
import test from "node:test";
import { adminAssetListQuerySchema } from "./validators";

test("media list filters accept documents and reference states", () => {
  const parsed = adminAssetListQuerySchema.parse({ kind: "DOCUMENT", referenced: "UNUSED", deleted: "trash" });
  assert.equal(parsed.kind, "DOCUMENT");
  assert.equal(parsed.referenced, "UNUSED");
  assert.equal(parsed.deleted, "trash");
});

test("media list filters default to all active assets", () => {
  assert.deepEqual(adminAssetListQuerySchema.parse({}), {
    page: 1,
    q: "",
    kind: "ALL",
    referenced: "ALL",
    deleted: "active",
  });
});
