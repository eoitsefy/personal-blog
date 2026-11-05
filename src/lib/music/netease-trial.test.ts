import assert from "node:assert/strict";
import test from "node:test";
import { cleanProviderMessage, isLocalMusicTrial, neteasePlaybackRights, neteaseProviderErrorStatus, safeMusicId, safeNeteaseMediaUrl } from "./netease-trial";

test("provider authorization failures stay authorization errors even with HTTP 200", () => {
  assert.equal(neteaseProviderErrorStatus("301", 200), 401);
  assert.equal(neteaseProviderErrorStatus("401", 200), 401);
  assert.equal(neteaseProviderErrorStatus("403", 200), 403);
  assert.equal(neteaseProviderErrorStatus("429", 200), 429);
  assert.equal(neteaseProviderErrorStatus("UNKNOWN", 503), 502);
});

test("music trial rejects production, non-local hosts, cross-site requests and forged origins", () => {
  const local = "http://127.0.0.1:3033/api/dev/music";
  assert.equal(isLocalMusicTrial(new Request(local), "development"), true);
  assert.equal(isLocalMusicTrial(new Request("http://localhost:3033/api/dev/music", { headers: { host: "127.0.0.1:3033", origin: "http://127.0.0.1:3033" } }), "development"), true);
  assert.equal(isLocalMusicTrial(new Request(local), "production"), false);
  assert.equal(isLocalMusicTrial(new Request("https://eastherphil.cn/api/dev/music"), "development"), false);
  assert.equal(isLocalMusicTrial(new Request(local, { headers: { host: "attacker.example" } }), "development"), false);
  assert.equal(isLocalMusicTrial(new Request(local, { headers: { origin: "https://attacker.example" } }), "development"), false);
  assert.equal(isLocalMusicTrial(new Request(local, { headers: { "sec-fetch-site": "cross-site" } }), "development"), false);
});

test("audio URL validation permits only HTTPS provider CDN URLs without credentials or custom ports", () => {
  assert.equal(safeNeteaseMediaUrl("https://m10.music.126.net/test.mp3?expires=123"), "https://m10.music.126.net/test.mp3?expires=123");
  assert.equal(safeNeteaseMediaUrl("http://iot202.music.126.net/test.mp3?expires=123"), "https://iot202.music.126.net/test.mp3?expires=123");
  for (const url of ["http://m10.music.126.net:8080/test.mp3", "https://m10.music.126.net.attacker.example/a", "https://127.0.0.1/a", "https://user:pass@m10.music.126.net/a", "https://m10.music.126.net:8080/a", "file:///secret"]) {
    assert.equal(safeNeteaseMediaUrl(url), undefined);
  }
});

test("provider errors cannot reflect known secrets or credential URL parameters", () => {
  const secret = "test-secret-value";
  const message = cleanProviderMessage(`Invalid appSecret=${secret}; url=https://example.com/?accessToken=secret`, [secret]);
  assert.equal(message.includes(secret), false);
  assert.equal(message.includes("https://"), false);
  assert.ok(message.length <= 220);
});

test("opaque provider song IDs are accepted without allowing arbitrary paths", () => {
  assert.equal(safeMusicId("ABC123_def-xyz"), true);
  assert.equal(safeMusicId("../admin"), false);
  assert.equal(safeMusicId("a".repeat(101)), false);
});

test("playback preserves a valid segment even when full trial flags also exist", () => {
  assert.deepEqual(neteasePlaybackRights({ freeTrail: { start: 32.5, end: 62.5 }, freeTrialPrivilege: { resConsumable: true, userConsumable: true } }), { preview: true, previewStart: 32.5, previewEnd: 62.5, reason: "平台提供片段试听" });
});

test("playback never interprets incomplete or invalid trial bounds as full playback", () => {
  for (const freeTrail of [true, {}, { start: 0 }, { start: 10, end: 2 }, { start: -1, end: 30 }, { start: 0, end: Infinity }]) {
    assert.throws(() => neteasePlaybackRights({ freeTrail }), /试听片段范围不完整/);
  }
  assert.throws(() => neteasePlaybackRights({ freeTrailFlag: true }), /播放权限/);
});

test("full audition needs both explicit privilege flags", () => {
  assert.equal(neteasePlaybackRights({ freeTrialPrivilege: { resConsumable: true, userConsumable: true } }).fullTrial, true);
  assert.equal(neteasePlaybackRights({ freeTrialPrivilege: {} }).preview, false);
  assert.equal(neteasePlaybackRights({ freeTrail: null, playFlag: true }).preview, false);
});

test("explicit copyright and payment restrictions do not become playback grants", () => {
  assert.throws(() => neteasePlaybackRights({ visible: false, freeTrail: { start: 0, end: 30 } }), /版权或地区/);
  assert.throws(() => neteasePlaybackRights({ playFlag: false, songFee: 1 }), /会员/);
  assert.throws(() => neteasePlaybackRights({ playFlag: false, songFee: 4 }), /购买/);
});
