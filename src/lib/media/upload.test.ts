import assert from "node:assert/strict";
import test from "node:test";
import { MediaValidationError } from "./image";
import { validateAssetUpload } from "./upload";

test("generic browser MIME falls back only for safe text document extensions", async () => {
  const result = await validateAssetUpload(new File(["# Daily note\n"], "daily.md", { type: "application/octet-stream" }));
  assert.equal(result.kind, "DOCUMENT");
  assert.equal(result.mime, "text/markdown");

  await assert.rejects(
    validateAssetUpload(new File(["fake office file"], "report.docx", { type: "application/octet-stream" })),
    MediaValidationError,
  );
});
