import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTags, normalizeTaxonomyTerm, taxonomySlug } from "./post-taxonomy";

test("taxonomy slugs support Chinese and normalized separators", () => {
  assert.equal(taxonomySlug("  Web 开发 / Next.js  "), "web-开发-nextjs");
  assert.deepEqual(normalizeTaxonomyTerm("  技术 随笔 "), { name: "技术 随笔", slug: "技术-随笔" });
});

test("tags are normalized and deduplicated by slug", () => {
  assert.deepEqual(normalizeTags(["Next.js", " nextjs ", "Prisma", "Prisma"]), [
    { name: "Next.js", slug: "nextjs" },
    { name: "Prisma", slug: "prisma" },
  ]);
});
