import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicPostWhere, listHref } from "./post-query";

const filters = { page: 2, q: "Prisma", category: "技术", tag: "nextjs" };

test("public queries always exclude drafts and soft-deleted posts", () => {
  const where = buildPublicPostWhere(filters);
  assert.equal(where.status, "PUBLISHED");
  assert.equal(where.deletedAt, null);
  assert.ok(where.OR);
  assert.deepEqual(where.category, { slug: "技术" });
  assert.deepEqual(where.tags, { some: { tag: { slug: "nextjs" } } });
});

test("pagination links preserve active filters", () => {
  assert.equal(listHref(filters, 3), "/posts?q=Prisma&category=%E6%8A%80%E6%9C%AF&tag=nextjs&page=3");
});
