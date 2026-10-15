import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { POST as login } from "../app/api/auth/login/route";
import { clearLoginPair, consumeLoginThrottle, loginThrottleKey, loginThrottleKeys } from "./login-throttle";
import { prisma } from "./prisma";

type Value = string | number | null;
type Row = Record<string, Value>;
type Database = {
  exec(sql: string): void;
  prepare(sql: string): { all(...values: Value[]): Row[]; get(...values: Value[]): Row | undefined; run(...values: Value[]): unknown };
  close(): void;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };
const now = new Date("2026-10-15T12:00:00.000Z");
const request = (ip = "198.51.100.1") => new Request("http://localhost/api/auth/login", { headers: { "x-real-ip": ip } });

// Execute the production UPSERT SQL, rather than mocking its counter decisions.
// SQLite supplies a portable transactional fixture; PostgreSQL concurrency is
// covered separately by login-throttle.integration.test.ts.
function fixture(t: TestContext) {
  const db = new DatabaseSync(":memory:");
  db.exec('CREATE TABLE "LoginThrottle" ("key" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL, "windowStartedAt" TEXT NOT NULL, "blockedUntil" TEXT, "updatedAt" TEXT NOT NULL)');
  const read = (key: string) => db.prepare('SELECT * FROM "LoginThrottle" WHERE "key" = ?').get(key);
  const tx = {
    $queryRaw: async (query: Prisma.Sql) => db.prepare(query.sql).all(...query.values.map(value => value instanceof Date ? value.toISOString() : value as Value)),
    loginThrottle: { findUnique: async ({ where }: { where: { key: string } }) => {
      const row = read(where.key);
      return row ? { ...row, blockedUntil: row.blockedUntil ? new Date(String(row.blockedUntil)) : null } : null;
    } },
  } as unknown as Prisma.TransactionClient;
  let queue = Promise.resolve();
  let transactions = 0;
  const originalTransaction = prisma.$transaction;
  Reflect.set(prisma, "$transaction", (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => {
    transactions++;
    const result = queue.then(async () => {
      db.exec("BEGIN");
      try { const value = await callback(tx); db.exec("COMMIT"); return value; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
  const originalDelete = prisma.loginThrottle.deleteMany;
  const originalFindFirst = prisma.loginThrottle.findFirst;
  Reflect.set(prisma.loginThrottle, "findFirst", async ({ where }: { where: { key: { in: string[] }; blockedUntil: { gt: Date } } }) => {
    const row = db.prepare('SELECT "blockedUntil" FROM "LoginThrottle" WHERE "key" IN (?, ?, ?) AND "blockedUntil" > ? ORDER BY "blockedUntil" DESC LIMIT 1').get(...where.key.in, where.blockedUntil.gt.toISOString());
    return row ? { blockedUntil: new Date(String(row.blockedUntil)) } : null;
  });
  Reflect.set(prisma.loginThrottle, "deleteMany", async ({ where }: { where: { key: string } }) => db.prepare('DELETE FROM "LoginThrottle" WHERE "key" = ?').run(where.key));
  t.after(() => { Reflect.set(prisma, "$transaction", originalTransaction); Reflect.set(prisma.loginThrottle, "deleteMany", originalDelete); Reflect.set(prisma.loginThrottle, "findFirst", originalFindFirst); db.close(); });
  return { read, transactions: () => transactions, rows: () => db.prepare('SELECT * FROM "LoginThrottle"').all(), seed: (key: string, blockedUntil: Date) => {
    db.prepare('INSERT INTO "LoginThrottle" VALUES (?, 5, ?, ?, ?)').run(key, now.toISOString(), blockedUntil.toISOString(), now.toISOString());
  } };
}

test("login limits share independent IP/account keys and preserve legacy pair blocks", () => {
  const first = loginThrottleKeys(request(), " Person@Example.test ");
  const anotherEmail = loginThrottleKeys(request(), "other@example.test");
  const anotherIp = loginThrottleKeys(request("198.51.100.2"), "person@example.test");
  assert.equal(first.ip, anotherEmail.ip);
  assert.equal(first.account, anotherIp.account);
  assert.notEqual(first.pair, anotherEmail.pair);
  assert.notEqual(first.pair, anotherIp.pair);
  assert.equal(first.pair, loginThrottleKey(request(), "person@example.test"));
  assert.equal(new Set(Object.values(first)).size, 3);
  Object.values(first).forEach(key => assert.match(key, /^[a-f0-9]{64}$/));
});

test("the pair admits five attempts and denied requests do not extend blocks or spend budgets", async (t) => {
  const db = fixture(t), keys = loginThrottleKeys(request(), "pair@example.test");
  for (let i = 0; i < 5; i++) assert.equal((await consumeLoginThrottle(keys, now)).limited, false);
  const before = db.rows();
  const transactions = db.transactions();
  assert.deepEqual(await consumeLoginThrottle(keys, new Date(now.getTime() + 100_000)), { limited: true, retryAfterSeconds: 1700 });
  assert.deepEqual(db.rows(), before);
  assert.equal(db.transactions(), transactions);
});

test("changing email cannot evade the IP request budget", async (t) => {
  fixture(t);
  for (let i = 0; i < 35; i++) {
    assert.equal((await consumeLoginThrottle(loginThrottleKeys(request(), `person-${i}@example.test`), now)).limited, i >= 30);
  }
  assert.equal((await consumeLoginThrottle(loginThrottleKeys(request("198.51.100.2"), "different@example.test"), now)).limited, false);
});

test("changing IP cannot evade the account request budget", async (t) => {
  fixture(t);
  for (let i = 0; i < 25; i++) {
    assert.equal((await consumeLoginThrottle(loginThrottleKeys(request(`198.51.100.${i + 1}`), "shared@example.test"), now)).limited, i >= 20);
  }
});

test("parallel reservations admit only five requests for one pair", async (t) => {
  const db = fixture(t), keys = loginThrottleKeys(request(), "parallel@example.test");
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeLoginThrottle(keys, now)));
  assert.equal(results.filter(result => !result.limited).length, 5);
  Object.values(keys).forEach(key => assert.equal(db.read(key)?.attempts, 5));
});

test("expired windows reset counters and pair cooldown survives the shorter window", async (t) => {
  const db = fixture(t), keys = loginThrottleKeys(request(), "expiry@example.test");
  for (let i = 0; i < 4; i++) await consumeLoginThrottle(keys, now);
  const nextWindow = new Date(now.getTime() + 15 * 60_000);
  assert.equal((await consumeLoginThrottle(keys, nextWindow)).limited, false);
  assert.equal(db.read(keys.pair)?.attempts, 1);
  for (let i = 0; i < 4; i++) await consumeLoginThrottle(keys, nextWindow);
  assert.equal((await consumeLoginThrottle(keys, new Date(nextWindow.getTime() + 15 * 60_000))).limited, true);
  assert.equal((await consumeLoginThrottle(keys, new Date(nextWindow.getTime() + 30 * 60_000))).limited, false);
  assert.equal(db.read(keys.pair)?.attempts, 1);
});

test("successful logins clear only the pair and cannot refill aggregate budgets", async (t) => {
  const db = fixture(t), keys = loginThrottleKeys(request(), "success@example.test");
  for (let i = 0; i < 20; i++) {
    assert.equal((await consumeLoginThrottle(keys, now)).limited, false);
    await clearLoginPair(keys);
  }
  assert.equal(db.read(keys.pair), undefined);
  assert.equal(db.read(keys.ip)?.attempts, 20);
  assert.equal(db.read(keys.account)?.attempts, 20);
  assert.equal((await consumeLoginThrottle(keys, now)).limited, true);
});

test("a denied last bucket rolls back earlier reservations", async (t) => {
  const db = fixture(t), keys = loginThrottleKeys(request(), "rollback@example.test");
  const blockedKey = keys.pair;
  db.seed(blockedKey, new Date(now.getTime() + 60_000));
  // Model a competing request blocking the pair after the optimistic read.
  Reflect.set(prisma.loginThrottle, "findFirst", async () => null);
  assert.equal((await consumeLoginThrottle(keys, now)).limited, true);
  assert.equal(db.rows().length, 1);
  assert.equal(db.read(blockedKey)?.attempts, 5);
});

test("a blocked login returns 429 before account lookup or password work", async (t) => {
  const db = fixture(t), email = "blocked@example.test", keys = loginThrottleKeys(request(), email);
  db.seed(keys.pair, new Date(Date.now() + 60_000));
  const original = prisma.user.findUnique;
  const lookup = t.mock.fn(() => { throw new Error("Account lookup must not run"); });
  Reflect.set(prisma.user, "findUnique", lookup);
  t.after(() => { Reflect.set(prisma.user, "findUnique", original); });
  const response = await login(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.1" },
    body: JSON.stringify({ email, password: "incorrect-password" }),
  }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal(lookup.mock.callCount(), 0);
});

test("database failures cannot silently admit a login", async (t) => {
  fixture(t);
  const failure = new Error("Database unavailable");
  Reflect.set(prisma, "$transaction", async () => { throw failure; });
  await assert.rejects(consumeLoginThrottle(loginThrottleKeys(request(), "error@example.test"), now), failure);
});

test("transaction acquisition contention backs off without admitting password work", async (t) => {
  const db = fixture(t);
  Reflect.set(prisma, "$transaction", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Transaction API error: Unable to start a transaction in the given time.", {
      code: "P2028", clientVersion: "6.19.3",
    });
  });
  const original = prisma.user.findUnique;
  const lookup = t.mock.fn(() => { throw new Error("Account lookup must not run"); });
  Reflect.set(prisma.user, "findUnique", lookup);
  t.after(() => { Reflect.set(prisma.user, "findUnique", original); });
  const response = await login(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.1" },
    body: JSON.stringify({ email: "busy@example.test", password: "incorrect-password" }),
  }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "1");
  assert.equal(lookup.mock.callCount(), 0);
  assert.deepEqual(db.rows(), []);
});

test("errors from an acquired transaction cannot be mistaken for pool contention", async (t) => {
  fixture(t);
  const failure = new Prisma.PrismaClientKnownRequestError("Transaction API error: Transaction already closed.", {
    code: "P2028", clientVersion: "6.19.3",
  });
  Reflect.set(prisma, "$transaction", async () => { throw failure; });
  await assert.rejects(consumeLoginThrottle(loginThrottleKeys(request(), "error@example.test"), now), failure);
});
