import assert from "node:assert/strict";
import test from "node:test";
import { getUiPreviewPost, getUiPreviewPostList } from "./ui-preview";

const query = {
  page: 1,
  q: "",
  category: "",
  tag: "",
};

test("UI preview data exercises both pages of the public archive", () => {
  const firstPage = getUiPreviewPostList(query, 10);
  const secondPage = getUiPreviewPostList({ ...query, page: 2 }, 10);

  assert.equal(firstPage.total, 12);
  assert.equal(firstPage.posts.length, 10);
  assert.equal(secondPage.posts.length, 2);
  assert.notEqual(firstPage.posts[0]?.slug, secondPage.posts[0]?.slug);
});

test("UI preview data supports category, tag, and keyword filters", () => {
  const category = getUiPreviewPostList({ ...query, category: "journey" }, 10);
  const tag = getUiPreviewPostList({ ...query, tag: "deployment" }, 10);
  const keyword = getUiPreviewPostList({ ...query, q: "Next.js" }, 10);

  assert.equal(category.total, 2);
  assert.ok(category.posts.every((post) => post.category?.slug === "journey"));
  assert.equal(tag.total, 4);
  assert.ok(tag.posts.every((post) => post.tags.some(({ tag: item }) => item.slug === "deployment")));
  assert.ok(keyword.total >= 1);
  assert.ok(keyword.posts.some((post) => post.slug === "nextjs-app-router-notes"));
});

test("UI preview detail includes long-form Markdown and rejects unknown slugs", () => {
  const post = getUiPreviewPost("building-a-quiet-personal-archive");

  assert.ok(post);
  assert.equal(post.status, "PUBLISHED");
  assert.match(post.contentMd, /```ts/);
  assert.match(post.contentMd, /dawn-archive\.png/);
  assert.equal(getUiPreviewPost("missing-preview-post"), null);
});
