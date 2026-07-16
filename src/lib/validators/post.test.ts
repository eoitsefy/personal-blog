import assert from "node:assert/strict";
import test from "node:test";
import { CreatePostInputSchema, UpdatePostInputSchema } from "./post";

test("a valid draft passes article validation", () => {
  const result = CreatePostInputSchema.safeParse({
    title: "Phase 1A",
    slug: "phase-1a",
    excerpt: "A stable article workflow",
    contentMd: "# Article content",
    status: "DRAFT",
    category: "技术",
    tags: ["Next.js", "Prisma"],
  });
  assert.equal(result.success, true);
});

test("invalid slugs are rejected", () => {
  const result = CreatePostInputSchema.safeParse({
    title: "Bad slug",
    slug: "Bad Slug",
    contentMd: "content",
    status: "DRAFT",
  });
  assert.equal(result.success, false);
});

test("article updates require at least one valid field", () => {
  assert.equal(UpdatePostInputSchema.safeParse({ status: "PUBLISHED" }).success, true);
  assert.equal(UpdatePostInputSchema.safeParse({}).success, false);
});

test("post input limits taxonomy values", () => {
  const base = {
    title: "测试文章",
    slug: "test-post",
    excerpt: "",
    contentMd: "正文",
    status: "DRAFT" as const,
    category: "技术",
  };
  assert.equal(CreatePostInputSchema.safeParse({ ...base, tags: ["Next.js"] }).success, true);
  assert.equal(CreatePostInputSchema.safeParse({ ...base, tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`) }).success, false);
});
