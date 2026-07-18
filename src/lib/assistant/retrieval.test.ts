import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, rankEvidence } from "./retrieval";

const candidates = [
  { id: "one", heading: "部署", content: "博客使用 Docker Compose 和 Nginx 部署", post: { id: "p1", slug: "deploy", title: "部署记录", excerpt: null } },
  { id: "two", heading: "散步", content: "周末在湖边散步", post: { id: "p2", slug: "walk", title: "湖边记录", excerpt: null } },
];

test("lexical retrieval ranks relevant Chinese evidence", () => {
  const ranked = rankEvidence("博客如何部署", candidates, { limit: 2, minScore: 0.1 });
  assert.equal(ranked[0]?.id, "one");
  assert.equal(ranked.some(({ id }) => id === "two"), false);
});

test("cosine similarity rejects incompatible vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1], [1, 2]), 0);
});
