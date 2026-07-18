import assert from "node:assert/strict";
import test from "node:test";
import { chunkPost, contentVersion } from "./chunking";

test("chunkPost preserves headings while removing active Markdown structure", () => {
  const chunks = chunkPost("# 部署\n\n通过 Docker 部署。\n\n## 验收\n\n[查看文章](/posts/test) 并确认。```js\nsecret()\n```", 40);
  assert.equal(chunks[0].heading, "部署");
  assert.match(chunks[0].content, /Docker/);
  assert.equal(chunks.at(-1)?.heading, "验收");
  assert.doesNotMatch(chunks.at(-1)?.content ?? "", /secret/);
});

test("contentVersion changes when public content changes", () => {
  const first = contentVersion({ title: "A", slug: "a", contentMd: "one" });
  const second = contentVersion({ title: "A", slug: "a", contentMd: "two" });
  assert.notEqual(first, second);
});
