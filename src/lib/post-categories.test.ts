import test from "node:test";
import assert from "node:assert/strict";
import { categoryFilterSlugs, fixedCategory } from "./post-categories";
import { normalizePostCategory, normalizeTags } from "./post-taxonomy";
test("fixed categories map Chinese labels and stable keys without changing tags", () => {
  assert.deepEqual(normalizePostCategory("技术随记"), { name: "技术随记", slug: "development" });
  assert.deepEqual(normalizePostCategory("daily-life"), { name: "生活切片", slug: "daily-life" });
  assert.equal(fixedCategory("阅读与灵感")?.slug, "reading");
  assert.ok(categoryFilterSlugs("development").includes("技术"));
  assert.equal(normalizePostCategory(""), null);
  assert.deepEqual(normalizePostCategory("旧分类"), { name: "旧分类", slug: "旧分类" });
  assert.equal(normalizeTags(["技术随记"])[0].slug, "技术随记");
});
