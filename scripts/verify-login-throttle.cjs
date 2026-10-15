// Run only inside the selected release container. Test identities are unique
// reserved addresses and .invalid emails; delete only the rows owned here.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS probe piped to node in the production image. */
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const suffix = randomUUID().replaceAll('-', '');
const ip = '2001:db8:' + suffix.match(/.{4}/g).slice(0, 6).join(':');
const email = `release-check-${suffix}@example.invalid`;
const hash = text => createHash('sha256').update(text).digest('hex');
const keys = [hash(`${ip}|${email}`), hash(`login:ip\0${ip}`), hash(`login:account\0${email}`)];
const where = { key: { in: keys } };
let owned = false;
async function attempt() {
  const response = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ email, password: `invalid-${suffix}`, audience: 'ADMIN' }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.headers.get('set-cookie'), null);
  const body = await response.json();
  assert.equal(body.success, false);
  if (response.status === 429) {
    assert.equal(body.error.code, 'RATE_LIMITED');
    const retry = Number(response.headers.get('retry-after'));
    assert.ok(retry >= 1 && retry <= 1800);
  } else {
    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  }
  return response.status;
}
(async () => {
  assert.equal(await db.loginThrottle.count({ where }), 0);
  owned = true;
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, attempt));
  console.log(JSON.stringify({ parallel_outcomes: outcomes.map(outcome => outcome.status === 'fulfilled'
    ? outcome.value : { error: outcome.reason?.name, message: String(outcome.reason?.message).slice(0, 250) }) }));
  outcomes.forEach(outcome => assert.equal(outcome.status, 'fulfilled'));
  const statuses = outcomes.map(outcome => outcome.value);
  assert.equal(statuses.filter(status => status === 401).length, 5);
  assert.equal(statuses.filter(status => status === 429).length, 7);
  const rows = await db.loginThrottle.findMany({ where, orderBy: { key: 'asc' } });
  assert.equal(rows.length, 3);
  rows.forEach(row => assert.equal(row.attempts, 5));
  assert.ok(rows.find(row => row.key === keys[0]).blockedUntil > new Date());
  assert.equal(await attempt(), 429);
  assert.deepEqual(await db.loginThrottle.findMany({ where, orderBy: { key: 'asc' } }), rows);
  console.log(JSON.stringify({ status: 'verified', parallel_requests: 12, admitted_401: 5,
    limited_429: 7, retry_after_valid: true, three_bucket_counts: [5, 5, 5],
    denied_request_keeps_counters_and_deadline: true, sessions_created: false }));
})().catch(error => { console.error(JSON.stringify({ check_failed: error.name,
  message: String(error.message).slice(0, 1000) })); process.exitCode = 1; })
  .finally(async () => {
    try {
      if (owned) {
        await db.loginThrottle.deleteMany({ where });
        assert.equal(await db.loginThrottle.count({ where }), 0);
        console.log(JSON.stringify({ synthetic_throttle_rows_cleaned: true }));
      }
    } catch { console.error('LOGIN_RELEASE_CLEANUP_FAILED'); process.exitCode = 1; }
    await db.$disconnect();
  });
