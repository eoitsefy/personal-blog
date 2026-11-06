import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMusicQuery, normalizeProviderSongs, parseMusicSearchSongs } from "./music-search";

const provider = { code: 200, result: { songs: [
  { id: 22636694, name: "  東方\u0000妖怪  ", artists: [{ name: "Artist" }], album: { name: "Album" }, url: "https://evil.invalid/audio" },
  { id: "22636694", name: "duplicate", artists: [{ name: "Other" }] },
  { id: "1/../../evil", name: "bad", artists: [{ name: "Other" }] },
] } };
test("query and provider metadata are bounded, normalized and never trust URLs", () => {
  assert.equal(normalizeMusicQuery("  ＡＢＣ　 x "), "ABC x");
  for (const input of ["", "a\nb", "a\u0000b", "x".repeat(81)]) assert.equal(normalizeMusicQuery(input), null);
  const songs = normalizeProviderSongs(provider)!; assert.equal(songs.length, 1);
  assert.equal(songs[0].id, "22636694"); assert.equal(songs[0].name, "東方 妖怪");
  assert.equal(songs[0].url, "https://music.163.com/#/song?id=22636694");
  assert.deepEqual(parseMusicSearchSongs(songs), songs);
  assert.equal(parseMusicSearchSongs([{ ...songs[0], url: "https://evil.invalid/" }]), null);
  assert.equal(normalizeProviderSongs({ code: 200, result: { songs: [{ id: "bad", name: "bad", artists: [] }] } }), null);
  assert.deepEqual(normalizeProviderSongs({ code: 200, result: { songs: [] } }), []);
  assert.equal(parseMusicSearchSongs(Array(11).fill(songs[0])), null);
  assert.equal(normalizeProviderSongs({ code: 200, result: { songCount: 0 } })?.length, 0);
  assert.equal(normalizeProviderSongs({ code: 200, result: {} }), null);
});
