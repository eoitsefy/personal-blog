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

test("post input limits and deduplicates media references", () => {
  const base = {
    title: "媒体文章",
    slug: "media-post",
    contentMd: "正文",
    status: "DRAFT" as const,
  };
  assert.equal(CreatePostInputSchema.safeParse({ ...base, assetIds: ["asset-1"] }).success, true);
  assert.equal(CreatePostInputSchema.safeParse({ ...base, assetIds: ["asset-1", "asset-1"] }).success, false);
  assert.equal(CreatePostInputSchema.safeParse({ ...base, assetIds: Array.from({ length: 21 }, (_, index) => `asset-${index}`) }).success, false);
});

test("post input accepts trusted video directives and rejects untrusted embeds", () => {
  const base = {
    title: "视频文章",
    slug: "video-post",
    status: "DRAFT" as const,
  };
  assert.equal(CreatePostInputSchema.safeParse({
    ...base,
    contentMd: "[video:公开记录](https://www.bilibili.com/video/BV1xx411c7mD)",
  }).success, true);
  assert.equal(CreatePostInputSchema.safeParse({
    ...base,
    contentMd: "[video:不可信来源](https://evil.example/video/123)",
  }).success, false);
});
