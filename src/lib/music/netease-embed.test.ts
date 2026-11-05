import assert from "node:assert/strict";
import test from "node:test";
import { neteaseEmbedUrl, neteaseResourceUrl, parseNeteaseShare, parseStoredMusic, validMusicSelection } from "./netease-embed";

test("accepts official complete song, playlist and album links in share text", () => {
  assert.deepEqual(parseNeteaseShare("分享歌曲 https://music.163.com/#/song?id=22636694&x=1"), { type: "song", id: "22636694" });
  assert.deepEqual(parseNeteaseShare("http://y.music.163.com/m/playlist?id=12345&userid=67"), { type: "playlist", id: "12345" });
  assert.deepEqual(parseNeteaseShare("https://music.163.com/album?id=123"), { type: "album", id: "123" });
});
test("rejects lookalikes, credentials, explicit ports, unsupported types and unsafe IDs", () => {
  for (const text of ["https://evil.music.163.com/song?id=123", "https://music.163.com.evil.test/song?id=123", "https://music.163.com@evil.test/song?id=123", "https://name@music.163.com/song?id=123", "https://music.163.com:443/song?id=123", "https://163cn.tv/abc", "https://music.163.com/user?id=123", "https://music.163.com/song?id=123&id=456", "https://music.163.com/song?id=1e2", "evilhttps://music.163.com/song?id=123", "https://music.163.com/song?id=0"]) assert.equal(parseNeteaseShare(text), null, text);
});
test("persists only a validated type and numeric ID; generated destinations are fixed", () => {
  assert.deepEqual(parseStoredMusic('{"type":"song","id":"123","token":"not-retained"}'), { type: "song", id: "123" });
  assert.equal(parseStoredMusic('{"type":"song","id":"1&auto=1"}'), null);
  assert.equal(validMusicSelection({ type: "song", id: 123 }), null);
  assert.equal(neteaseEmbedUrl({ type: "song", id: "123" }), "https://music.163.com/outchain/player?type=2&id=123&auto=0&height=66");
  assert.equal(neteaseEmbedUrl({ type: "playlist", id: "456" }), "https://music.163.com/outchain/player?type=0&id=456&auto=0&height=430");
  assert.equal(neteaseEmbedUrl({ type: "album", id: "789" }), "https://music.163.com/outchain/player?type=1&id=789&auto=0&height=430");
  assert.equal(neteaseResourceUrl({ type: "song", id: "123" }), "https://music.163.com/#/song?id=123");
});
