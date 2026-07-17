import assert from "node:assert/strict";
import test from "node:test";
import { validateDocumentUpload } from "./document";
import { MediaValidationError } from "./image";

function simplePdf(extra = "") {
  return Buffer.from(`%PDF-1.7\n1 0 obj\n<< ${extra} >>\nendobj\ntrailer\n<<>>\n%%EOF\n`, "ascii");
}

test("a passive PDF with matching MIME and extension is accepted", async () => {
  const result = await validateDocumentUpload(new File([simplePdf()], "daily-note.pdf", { type: "application/pdf" }));
  assert.equal(result.kind, "DOCUMENT");
  assert.equal(result.mime, "application/pdf");
  assert.equal(result.extension, "pdf");
});

test("PDF active content and spoofed PDF files are rejected", async () => {
  await assert.rejects(
    validateDocumentUpload(new File([simplePdf("/JavaScript (alert)")], "unsafe.pdf", { type: "application/pdf" })),
    MediaValidationError,
  );
  await assert.rejects(
    validateDocumentUpload(new File([Buffer.from("not a pdf")], "fake.pdf", { type: "application/pdf" })),
    MediaValidationError,
  );
  await assert.rejects(
    validateDocumentUpload(new File([simplePdf()], "daily-note.txt", { type: "application/pdf" })),
    MediaValidationError,
  );
});

test("UTF-8 TXT and Markdown documents are normalized", async () => {
  const text = await validateDocumentUpload(new File(["今天下雨。\n"], "note.txt", { type: "text/plain" }));
  const markdown = await validateDocumentUpload(new File(["# Field note\n"], "NOTE.markdown", { type: "text/x-markdown" }));
  const browserFallback = await validateDocumentUpload(new File(["# Browser fallback\n"], "fallback.md", { type: "application/octet-stream" }));
  assert.equal(text.mime, "text/plain");
  assert.equal(text.extension, "txt");
  assert.equal(markdown.mime, "text/markdown");
  assert.equal(markdown.extension, "md");
  assert.equal(browserFallback.mime, "text/markdown");
});

test("non-UTF-8, HTML and SVG text uploads are rejected", async () => {
  await assert.rejects(
    validateDocumentUpload(new File([Uint8Array.from([0xff, 0xfe, 0x00])], "note.txt", { type: "text/plain" })),
    MediaValidationError,
  );
  await assert.rejects(
    validateDocumentUpload(new File(["<!doctype html><title>unsafe</title>"], "page.txt", { type: "text/plain" })),
    MediaValidationError,
  );
  await assert.rejects(
    validateDocumentUpload(new File(["<svg><script/></svg>"], "drawing.md", { type: "text/markdown" })),
    MediaValidationError,
  );
});
