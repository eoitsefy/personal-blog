/* eslint-disable @typescript-eslint/no-require-imports -- Executed inside the isolated CI container. */
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

// This probe is forbidden against anything except CI's disposable database.
if (process.env.CI !== 'true') throw new Error('CI=true is required');
let database;
try { database = new URL(process.env.DATABASE_URL); } catch { throw new Error('A disposable test database is required'); }
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.pathname.endsWith('_test') || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) {
  throw new Error('A local disposable _test database is required');
}
const db = new PrismaClient();
const suffix = randomUUID().replaceAll('-', '');
const ip = '2001:db8:' + suffix.match(/.{4}/g).slice(0, 6).join(':');
const email = `community-${suffix}@example.invalid`;
const adminEmail = `admin-${suffix}@example.invalid`;
const slug = `ci-community-${suffix}`;
const password = `Password-${randomBytes(24).toString('hex')}Aa1`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const registrationEmail = `registration:${email}`;
const throttleKeys = [hash(`${ip}|${registrationEmail}`), hash(`login:ip\0${ip}`), hash(`login:account\0${registrationEmail}`)];
const base = 'http://127.0.0.1:3000';
let postId, userId, commentRateKey;
let owned = false;
let stage = 'initialization';
function check(condition, label) { if (!condition) throw new Error(label); }
async function request(path, { method = 'GET', cookie, body, origin = base, site } = {}) {
  const headers = { 'x-real-ip': ip };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) { headers['content-type'] = 'application/json'; headers.origin = origin; }
  if (site) headers['sec-fetch-site'] = site;
  return fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(30000) });
}
function hasLink(html, path) { return new RegExp(`<a\\b[^>]*\\bhref=["']${path}["']`).test(html); }
async function main() {
  check(await db.user.count({ where: { email: { in: [email, adminEmail] } } }) === 0, 'fixture collision');
  check(await db.post.count({ where: { slug } }) === 0, 'post collision');
  check(await db.loginThrottle.count({ where: { key: { in: throttleKeys } } }) === 0, 'throttle collision');
  owned = true;
  const admin = await db.user.create({ data: { email: adminEmail, passwordHash: '!ci-fixture', role: 'ADMIN', status: 'ACTIVE' } });
  const adminToken = randomBytes(32).toString('base64url');
  await db.userSession.create({ data: { userId: admin.id, tokenHash: hash(adminToken), expiresAt: new Date(Date.now() + 3600000), lastSeenAt: new Date() } });
  const adminCookie = `blog_session=${adminToken}`;
  const post = await db.post.create({ data: { slug, title: 'CI community fixture', contentMd: 'Fixture', authorId: admin.id, status: 'PUBLISHED', publishedAt: new Date() } });
  postId = post.id;

  stage = 'anonymous pages and navigation';
  const musicPage = await request('/music'); check(musicPage.status === 200, stage);
  const html = await musicPage.text();
  check(hasLink(html, '/login') && hasLink(html, '/register') && !hasLink(html, '/admin'), stage);
  check((await request('/register')).status === 200, stage);

  stage = 'registration and cookie';
  const registration = await request('/api/auth/register', { method: 'POST', body: { email, password } });
  check(registration.status === 201, stage);
  const setCookie = registration.headers.get('set-cookie') || '';
  check(/(?:^|,)\s*blog_session=/.test(setCookie) && /;\s*httponly/i.test(setCookie) && /;\s*secure/i.test(setCookie) && /;\s*samesite=lax/i.test(setCookie), stage);
  const userCookie = setCookie.match(/blog_session=[^;]+/)?.[0]; check(Boolean(userCookie), stage);
  const user = await db.user.findUnique({ where: { email } });
  check(user && user.role === 'USER' && user.status === 'ACTIVE' && user.emailVerifiedAt === null, stage);
  userId = user.id;
  const candidateCommentRateKey = hash(`${ip}|${userId}`);
  check(await db.commentRateLimit.count({ where: { key: candidateCommentRateKey } }) === 0, 'comment rate fixture collision');
  commentRateKey = candidateCommentRateKey;

  stage = 'user and administrator navigation and authorization';
  const userPage = await request('/music', { cookie: userCookie }); check(userPage.status === 200, stage);
  const userHtml = await userPage.text(); check(hasLink(userHtml, '/account') && !hasLink(userHtml, '/admin'), stage);
  check((await request('/api/admin/working-copies/new', { cookie: userCookie })).status === 401, stage);
  check((await request('/api/admin/posts', { method: 'POST', cookie: userCookie, body: {} })).status === 401, stage);
  const adminPage = await request('/music', { cookie: adminCookie }); check(adminPage.status === 200, stage);
  check(hasLink(await adminPage.text(), '/admin'), stage);

  stage = 'comment moderation';
  const commentResponse = await request(`/api/posts/${slug}/comments`, { method: 'POST', cookie: userCookie, body: { content: 'CI community review comment' } });
  check(commentResponse.status === 201, stage);
  const commentId = (await commentResponse.json()).data.comment.id;
  check((await db.comment.findUnique({ where: { id: commentId } }))?.status === 'PENDING', stage);
  const commentsPath = `/api/posts/${slug}/comments`;
  const owner = await (await request(commentsPath, { cookie: userCookie })).json();
  const anonymous = await (await request(commentsPath)).json();
  check(owner.data.comments.some((comment) => comment.id === commentId) && !anonymous.data.comments.some((comment) => comment.id === commentId), stage);
  check((await request(`/api/admin/comments/${commentId}`, { method: 'PATCH', cookie: adminCookie, body: { action: 'PUBLISH' } })).status === 200, stage);
  const published = await (await request(commentsPath)).json();
  check(published.data.comments.some((comment) => comment.id === commentId), stage);

  stage = 'retired music API';
  const expectedMusic = { ok: true, mode: 'official-embed', ready: true, message: '音乐已改用网易云官方播放器。' };
  for (const cookie of [undefined, userCookie, adminCookie]) {
    const result = await request('/api/music', { cookie });
    check(result.status === 200 && /no-store/i.test(result.headers.get('cache-control') || ''), stage);
    const body = await result.json();
    check(JSON.stringify(body) === JSON.stringify(expectedMusic), stage);
    for (const action of ['search', 'play', 'login-start', 'login-check']) {
      const response = await request('/api/music', { method: 'POST', cookie, body: { action } });
      check(response.status === 410 && /no-store/i.test(response.headers.get('cache-control') || ''), stage);
      const retired = await response.json();
      check(retired.ok === false && retired.code === 'MUSIC_EMBED_ONLY', stage);
    }
  }
  check((await request('/api/music', { method: 'POST', cookie: userCookie, site: 'cross-site', body: { action: 'search' } })).status === 410, stage);
  console.log('community_music_http_regression=passed');
}
(async () => {
  try { await main(); }
  catch { console.error(`community_music_http_regression=failed stage=${stage}`); process.exitCode = 1; }
  finally {
    try {
      if (owned) {
        if (postId) await db.post.deleteMany({ where: { id: postId } });
        if (commentRateKey) await db.commentRateLimit.deleteMany({ where: { key: commentRateKey } });
        await db.user.deleteMany({ where: { email: { in: [email, adminEmail] } } });
        await db.loginThrottle.deleteMany({ where: { key: { in: throttleKeys } } });
      }
    } catch { console.error('community_music_fixture_cleanup=failed'); process.exitCode = 1; }
    await db.$disconnect();
  }
})();
