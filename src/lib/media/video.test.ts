import assert from "node:assert/strict";
import test from "node:test";
import { extractVideoDirectives, parseTrustedVideoUrl } from "./video";

test("trusted Bilibili and YouTube links produce fixed embed origins", () => {
  const bilibili = parseTrustedVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2");
  assert.equal(bilibili?.provider, "BILIBILI");
  assert.match(bilibili?.embedUrl ?? "", /^https:\/\/player\.bilibili\.com\/player\.html\?/);
  assert.match(bilibili?.embedUrl ?? "", /bvid=BV1xx411c7mD/);

  const youtube = parseTrustedVideoUrl("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(youtube?.provider, "YOUTUBE");
  assert.equal(youtube?.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
});

test("untrusted protocols, hosts, credentials, ports and malformed IDs are rejected", () => {
  const rejected = [
    "http://www.bilibili.com/video/BV1xx411c7mD",
    "https://b23.tv/example",
    "https://evil.example/video/BV1xx411c7mD",
    "https://user@example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:444/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
    "javascript:alert(1)",
  ];
  for (const value of rejected) assert.equal(parseTrustedVideoUrl(value), null, value);
});

test("structured video directives are extracted without accepting arbitrary iframe HTML", () => {
  assert.deepEqual(extractVideoDirectives("[video:巡礼记录](https://www.bilibili.com/video/BV1xx411c7mD)"), [
    { title: "巡礼记录", url: "https://www.bilibili.com/video/BV1xx411c7mD" },
  ]);
  assert.deepEqual(extractVideoDirectives('<iframe src="https://evil.example"></iframe>'), []);
});
