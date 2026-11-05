import assert from "node:assert/strict";
import test from "node:test";
import { MusicSessions, consumeMusicBudget } from "./netease-sessions";

test("provider login and cached search results cannot cross blog accounts", () => {
  const sessions = new MusicSessions(() => ({ token: "", songs: [] as string[] }), 2, 1_000);
  const first = sessions.get("reader-a", 0)!;
  first.token = "a-private-provider-token";
  first.songs.push("a-search-result");
  assert.equal(sessions.get("reader-a", 1), first);
  assert.deepEqual(sessions.get("reader-b", 2), { token: "", songs: [] });
  assert.equal(sessions.get("", 3), undefined);
  assert.equal(sessions.get("reader-c", 3), undefined);
  assert.notEqual(sessions.get("reader-a", 1_002), first);
  assert.deepEqual(sessions.get("reader-a", 1_003), { token: "", songs: [] });
});

test("music limits reject excess requests without extending the fixed window", () => {
  const budget = { windowStart: 0, calls: 0 };
  assert.equal(consumeMusicBudget(budget, 2, 1_000, 0), true);
  assert.equal(consumeMusicBudget(budget, 2, 1_000, 1), true);
  assert.equal(consumeMusicBudget(budget, 2, 1_000, 999), false);
  assert.equal(consumeMusicBudget(budget, 2, 1_000, 1_000), true);
  assert.equal(budget.calls, 1);
});
