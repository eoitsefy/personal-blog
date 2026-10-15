import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { consumeLoginThrottle, loginThrottleKeys } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";

assert.ok(process.env.TEST_DATABASE_URL && new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test"), "A disposable PostgreSQL test database is required");
assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
const request = (ip: string) => new Request("http://localhost/api/auth/login", { headers: { "x-real-ip": ip } });

test("PostgreSQL concurrent login reservations cannot lose counts or over-admit a pair", async () => {
  const keys = loginThrottleKeys(request("198.51.100.201"), `parallel-${randomUUID()}@example.test`);
  const now = new Date();
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeLoginThrottle(keys, now)));
    assert.equal(results.filter(result => !result.limited).length, 5);
    const rows = await prisma.loginThrottle.findMany({ where: { key: { in: Object.values(keys) } } });
    assert.equal(rows.length, 3);
    rows.forEach(row => assert.equal(row.attempts, 5));
    const before = rows.sort((a, b) => a.key.localeCompare(b.key));
    assert.equal((await consumeLoginThrottle(keys, now)).limited, true);
    assert.deepEqual((await prisma.loginThrottle.findMany({ where: { key: { in: Object.values(keys) } } })).sort((a, b) => a.key.localeCompare(b.key)), before);
    assert.equal((await consumeLoginThrottle(keys, new Date(now.getTime() + 30 * 60_000))).limited, false);
  } finally {
    await prisma.loginThrottle.deleteMany({ where: { key: { in: Object.values(keys) } } });
    await prisma.$disconnect();
  }
});

test("PostgreSQL aggregate budgets block rotating emails and rotating addresses", async () => {
  const suffix = randomUUID(), ownedKeys = new Set<string>(), now = new Date();
  const keysFor = (ip: string, email: string) => {
    const keys = loginThrottleKeys(request(ip), email);
    Object.values(keys).forEach(key => ownedKeys.add(key));
    return keys;
  };
  try {
    for (let i = 0; i < 31; i++) {
      assert.equal((await consumeLoginThrottle(keysFor("198.51.100.202", `ip-${i}-${suffix}@example.test`), now)).limited, i >= 30);
    }
    for (let i = 0; i < 21; i++) {
      assert.equal((await consumeLoginThrottle(keysFor(`203.0.113.${i + 1}`, `account-${suffix}@example.test`), now)).limited, i >= 20);
    }
  } finally {
    await prisma.loginThrottle.deleteMany({ where: { key: { in: [...ownedKeys] } } });
    await prisma.$disconnect();
  }
});
