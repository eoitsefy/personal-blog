import assert from "node:assert/strict";
import test from "node:test";
import { buildRssFeed, buildSitemap, safeJsonLd, type PublicPostSeoRecord } from "./seo";
import { absoluteUrl } from "./site";

const post: PublicPostSeoRecord = {
  slug: "field-note",
  title: "雨夜 & <归途>",
  excerpt: "一段带有 <标记> 的摘要",
  publishedAt: new Date("2026-07-17T01:00:00.000Z"),
  createdAt: new Date("2026-07-16T01:00:00.000Z"),
  updatedAt: new Date("2026-07-17T02:00:00.000Z"),
};

test("site URLs are canonical absolute URLs", () => {
  assert.equal(absoluteUrl("/posts"), "https://eastherphil.cn/posts");
});

test("sitemap contains public roots and post canonical URLs", () => {
  const sitemap = buildSitemap([post]);
  assert.deepEqual(sitemap.map(({ url }) => url), [
    "https://eastherphil.cn/",
    "https://eastherphil.cn/posts",
    "https://eastherphil.cn/places",
    "https://eastherphil.cn/posts/field-note",
  ]);
  assert.equal(sitemap[3]?.lastModified, post.updatedAt);
});

test("RSS escapes user-authored text and exposes stable post links", () => {
  const xml = buildRssFeed([post]);
  assert.match(xml, /<title>雨夜 &amp; &lt;归途&gt;<\/title>/);
  assert.match(xml, /<description>一段带有 &lt;标记&gt; 的摘要<\/description>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/eastherphil\.cn\/posts\/field-note<\/guid>/);
  assert.doesNotMatch(xml, /<title>雨夜 & </);
});

test("JSON-LD serialization neutralizes HTML tag openings", () => {
  assert.equal(safeJsonLd({ title: "</script>" }), '{"title":"\\u003c/script>"}');
});
