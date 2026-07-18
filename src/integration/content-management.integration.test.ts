import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { DELETE as deleteAsset } from "@/app/api/admin/assets/[id]/route";
import { DELETE as purgeAsset } from "@/app/api/admin/assets/[id]/purge/route";
import { POST as restoreAsset } from "@/app/api/admin/assets/[id]/restore/route";
import { POST as uploadAsset } from "@/app/api/admin/assets/route";
import { POST as createPost } from "@/app/api/admin/posts/route";
import { DELETE as deletePost, PATCH as updatePost } from "@/app/api/admin/posts/[id]/route";
import { DELETE as purgePost } from "@/app/api/admin/posts/[id]/purge/route";
import { POST as restorePost } from "@/app/api/admin/posts/[id]/restore/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as createInvitation } from "@/app/api/admin/users/invitations/route";
import { PATCH as updateUserStatus } from "@/app/api/admin/users/[id]/route";
import { POST as createPasswordReset } from "@/app/api/admin/users/[id]/password-reset/route";
import { POST as acceptInvitationRoute } from "@/app/api/auth/invitations/accept/route";
import { POST as resetPasswordRoute } from "@/app/api/auth/password-reset/route";
import { GET as listPublicPosts } from "@/app/api/posts/route";
import { GET as listComments, POST as createComment } from "@/app/api/posts/[slug]/comments/route";
import { DELETE as deleteOwnComment, PATCH as editOwnComment } from "@/app/api/comments/[id]/route";
import { POST as reportComment } from "@/app/api/comments/[id]/reports/route";
import { DELETE as deleteAdminComment, PATCH as moderateComment } from "@/app/api/admin/comments/[id]/route";
import { DELETE as purgeComment } from "@/app/api/admin/comments/[id]/purge/route";
import { PATCH as lockComments } from "@/app/api/admin/posts/[id]/comments/route";
import { POST as createPlace } from "@/app/api/admin/places/route";
import { DELETE as deletePlace } from "@/app/api/admin/places/[id]/route";
import { POST as restorePlace } from "@/app/api/admin/places/[id]/restore/route";
import { DELETE as purgePlace } from "@/app/api/admin/places/[id]/purge/route";
import { GET as listPublicPlaces } from "@/app/api/places/route";
import { hashPassword, hashSessionToken, issueUserSession, parseCookie, SESSION_COOKIE_NAME } from "@/lib/auth";
import { commentRateLimitKey } from "@/lib/comments";
import { loginThrottleKey } from "@/lib/login-throttle";

const prisma = new PrismaClient();
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZsAAAAASUVORK5CYII=",
  "base64",
);

test("places enforce privacy, published relations, recycle-bin rules and cover references", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let userId = "";
  let postId = "";
  let approximateId = "";
  let hiddenId = "";
  let unlinkedId = "";
  let assetId = "";

  try {
    const user = await prisma.user.create({ data: { email: `places-${suffix}@example.test`, passwordHash: await hashPassword("correct-horse-battery-staple"), role: "ADMIN" } });
    userId = user.id;
    const session = await issueUserSession(user.id);
    const cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
    const headers = { "content-type": "application/json", cookie, origin: "http://localhost" };
    const route = (id: string) => ({ params: Promise.resolve({ id }) });

    const cover = await prisma.asset.create({ data: { ossKey: `place-cover-${suffix}.png`, url: `/uploads/place-cover-${suffix}.png`, originalName: "地点封面.png", kind: "IMAGE", mime: "image/png", size: 1, sha256: "b".repeat(64), ownerId: user.id } });
    assetId = cover.id;
    const makePlace = async (slugPrefix: string, privacy: "APPROXIMATE" | "HIDDEN" | "EXACT", extra: Record<string, unknown> = {}) => {
      const response = await createPlace(new Request("http://localhost/api/admin/places", { method: "POST", headers, body: JSON.stringify({
        name: `${slugPrefix} place`, slug: `${slugPrefix}-${suffix}`, locationLabel: "杭州市", summary: "integration place",
        latitude: 30.123456, longitude: 120.654321, privacy, coordinateSystem: "GCJ02", coordinateSource: "integration fixture",
        publicLatitude: privacy === "APPROXIMATE" ? 30.1 : null,
        publicLongitude: privacy === "APPROXIMATE" ? 120.6 : null,
        ...extra,
      }) }));
      assert.equal(response.status, 201);
      return ((await response.json()) as { data: { place: { id: string } } }).data.place.id;
    };

    approximateId = await makePlace("approximate", "APPROXIMATE", { coverAssetId: assetId });
    hiddenId = await makePlace("hidden", "HIDDEN");
    unlinkedId = await makePlace("unlinked", "EXACT");
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 1);
    assert.equal((await deleteAsset(new Request(`http://localhost/api/admin/assets/${assetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }), route(assetId))).status, 409);

    const postResponse = await createPost(new Request("http://localhost/api/admin/posts", { method: "POST", headers, body: JSON.stringify({ title: "Place integration", slug: `place-post-${suffix}`, contentMd: "Published place note", status: "PUBLISHED", placeIds: [approximateId, hiddenId] }) }));
    assert.equal(postResponse.status, 201);
    postId = ((await postResponse.json()) as { data: { post: { id: string } } }).data.post.id;

    const publicResponse = await listPublicPlaces(new Request("http://localhost/api/places"));
    assert.equal(publicResponse.status, 200);
    const publicText = await publicResponse.text();
    const publicBody = JSON.parse(publicText) as { data: { places: Array<{ id: string; coordinates: { latitude: number; longitude: number } }> } };
    assert.deepEqual(publicBody.data.places.map(({ id }) => id), [approximateId]);
    assert.deepEqual(publicBody.data.places[0]?.coordinates, { latitude: 30.1, longitude: 120.6 });
    assert.equal(publicText.includes("30.123456"), false);
    assert.equal(publicText.includes("120.654321"), false);
    assert.equal(publicText.includes(hiddenId), false);
    assert.equal(publicText.includes(unlinkedId), false);

    assert.equal((await deletePlace(new Request(`http://localhost/api/admin/places/${approximateId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }), route(approximateId))).status, 200);
    const afterDelete = await listPublicPlaces(new Request("http://localhost/api/places"));
    assert.equal(((await afterDelete.json()) as { data: { places: unknown[] } }).data.places.length, 0);
    assert.equal((await purgePlace(new Request(`http://localhost/api/admin/places/${approximateId}/purge`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }), route(approximateId))).status, 409);
    assert.equal((await restorePlace(new Request(`http://localhost/api/admin/places/${approximateId}/restore`, { method: "POST", headers: { cookie, origin: "http://localhost" } }), route(approximateId))).status, 200);

    assert.equal((await updatePost(new Request(`http://localhost/api/admin/posts/${postId}`, { method: "PATCH", headers, body: JSON.stringify({ placeIds: [] }) }), route(postId))).status, 200);
    assert.equal((await deletePlace(new Request(`http://localhost/api/admin/places/${approximateId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }), route(approximateId))).status, 200);
    assert.equal((await purgePlace(new Request(`http://localhost/api/admin/places/${approximateId}/purge`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }), route(approximateId))).status, 200);
    approximateId = "";
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 0);
  } finally {
    if (postId) await prisma.post.deleteMany({ where: { id: postId } });
    await prisma.place.deleteMany({ where: { id: { in: [approximateId, hiddenId, unlinkedId].filter(Boolean) } } });
    if (assetId) await prisma.asset.deleteMany({ where: { id: assetId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("verified comments integrate moderation, replies, reports, locking and deletion", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const slug = `comments-${suffix}`;
  const address = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  const userIds: string[] = [];
  let postId = "";
  let rootId = "";
  let replyId = "";
  const rateKeys: string[] = [];

  const jsonRequest = (url: string, cookie: string | null, method: string, body?: unknown) => new Request(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      "x-real-ip": address,
      origin: "http://localhost",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  try {
    const [admin, reader, reporter] = await Promise.all([
      prisma.user.create({ data: { email: `comment-admin-${suffix}@example.test`, passwordHash: "unused", role: "ADMIN", emailVerifiedAt: new Date() } }),
      prisma.user.create({ data: { email: `comment-reader-${suffix}@example.test`, passwordHash: "unused", role: "USER", emailVerifiedAt: new Date() } }),
      prisma.user.create({ data: { email: `comment-reporter-${suffix}@example.test`, passwordHash: "unused", role: "USER", emailVerifiedAt: new Date() } }),
    ]);
    userIds.push(admin.id, reader.id, reporter.id);
    const [adminSession, readerSession, reporterSession] = await Promise.all([
      issueUserSession(admin.id), issueUserSession(reader.id), issueUserSession(reporter.id),
    ]);
    const adminCookie = `${SESSION_COOKIE_NAME}=${adminSession.token}`;
    const readerCookie = `${SESSION_COOKIE_NAME}=${readerSession.token}`;
    const reporterCookie = `${SESSION_COOKIE_NAME}=${reporterSession.token}`;
    rateKeys.push(
      commentRateLimitKey(jsonRequest("http://localhost", readerCookie, "GET"), reader.id),
      commentRateLimitKey(jsonRequest("http://localhost", reporterCookie, "GET"), reporter.id),
    );

    const post = await prisma.post.create({
      data: { slug, title: "Comment integration", contentMd: "Published", status: "PUBLISHED", publishedAt: new Date(), authorId: admin.id },
    });
    postId = post.id;

    const anonymous = await createComment(jsonRequest(`http://localhost/api/posts/${slug}/comments`, null, "POST", { content: "匿名评论" }), { params: Promise.resolve({ slug }) });
    assert.equal(anonymous.status, 401);

    const created = await createComment(jsonRequest(`http://localhost/api/posts/${slug}/comments`, readerCookie, "POST", { content: "第一条待审核评论" }), { params: Promise.resolve({ slug }) });
    assert.equal(created.status, 201);
    rootId = ((await created.json()) as { data: { comment: { id: string } } }).data.comment.id;
    assert.equal((await prisma.comment.findUniqueOrThrow({ where: { id: rootId } })).status, "PENDING");

    const visitorBeforeReview = await listComments(jsonRequest(`http://localhost/api/posts/${slug}/comments`, null, "GET"), { params: Promise.resolve({ slug }) });
    assert.equal(((await visitorBeforeReview.json()) as { data: { comments: unknown[] } }).data.comments.length, 0);
    const ownerBeforeReview = await listComments(jsonRequest(`http://localhost/api/posts/${slug}/comments`, readerCookie, "GET"), { params: Promise.resolve({ slug }) });
    assert.equal(((await ownerBeforeReview.json()) as { data: { comments: unknown[] } }).data.comments.length, 1);

    assert.equal((await moderateComment(jsonRequest(`http://localhost/api/admin/comments/${rootId}`, adminCookie, "PATCH", { action: "PUBLISH" }), { params: Promise.resolve({ id: rootId }) })).status, 200);
    const publicAfterReview = await listComments(jsonRequest(`http://localhost/api/posts/${slug}/comments`, null, "GET"), { params: Promise.resolve({ slug }) });
    const publicBody = (await publicAfterReview.json()) as { data: { comments: { authorLabel: string; content: string }[] } };
    assert.equal(publicBody.data.comments[0]?.content, "第一条待审核评论");
    assert.doesNotMatch(publicBody.data.comments[0]?.authorLabel ?? "", /@/);

    const reply = await createComment(jsonRequest(`http://localhost/api/posts/${slug}/comments`, reporterCookie, "POST", { content: "一级回复", parentId: rootId }), { params: Promise.resolve({ slug }) });
    assert.equal(reply.status, 201);
    replyId = ((await reply.json()) as { data: { comment: { id: string } } }).data.comment.id;
    assert.equal((await moderateComment(jsonRequest(`http://localhost/api/admin/comments/${replyId}`, adminCookie, "PATCH", { action: "PUBLISH" }), { params: Promise.resolve({ id: replyId }) })).status, 200);
    const nested = await createComment(jsonRequest(`http://localhost/api/posts/${slug}/comments`, readerCookie, "POST", { content: "不允许的二级回复", parentId: replyId }), { params: Promise.resolve({ slug }) });
    assert.equal(nested.status, 400);

    const report = await reportComment(jsonRequest(`http://localhost/api/comments/${rootId}/reports`, reporterCookie, "POST", { reason: "需要管理员检查" }), { params: Promise.resolve({ id: rootId }) });
    assert.equal(report.status, 201);
    assert.equal((await reportComment(jsonRequest(`http://localhost/api/comments/${rootId}/reports`, reporterCookie, "POST", { reason: "重复举报" }), { params: Promise.resolve({ id: rootId }) })).status, 409);

    const edit = await editOwnComment(jsonRequest(`http://localhost/api/comments/${rootId}`, readerCookie, "PATCH", { content: "编辑后重新审核" }), { params: Promise.resolve({ id: rootId }) });
    assert.equal(edit.status, 200);
    assert.equal((await prisma.comment.findUniqueOrThrow({ where: { id: rootId } })).status, "PENDING");

    assert.equal((await lockComments(jsonRequest(`http://localhost/api/admin/posts/${postId}/comments`, adminCookie, "PATCH", { locked: true }), { params: Promise.resolve({ id: postId }) })).status, 200);
    assert.equal((await createComment(jsonRequest(`http://localhost/api/posts/${slug}/comments`, reporterCookie, "POST", { content: "锁定后禁止" }), { params: Promise.resolve({ slug }) })).status, 403);
    assert.equal((await lockComments(jsonRequest(`http://localhost/api/admin/posts/${postId}/comments`, adminCookie, "PATCH", { locked: false }), { params: Promise.resolve({ id: postId }) })).status, 200);

    assert.equal((await deleteOwnComment(jsonRequest(`http://localhost/api/comments/${replyId}`, reporterCookie, "DELETE"), { params: Promise.resolve({ id: replyId }) })).status, 200);
    assert.ok((await prisma.comment.findUniqueOrThrow({ where: { id: replyId } })).deletedAt);
    assert.equal((await moderateComment(jsonRequest(`http://localhost/api/admin/comments/${replyId}`, adminCookie, "PATCH", { action: "RESTORE" }), { params: Promise.resolve({ id: replyId }) })).status, 200);
    assert.equal((await deleteAdminComment(jsonRequest(`http://localhost/api/admin/comments/${replyId}`, adminCookie, "DELETE"), { params: Promise.resolve({ id: replyId }) })).status, 200);
    assert.equal((await purgeComment(jsonRequest(`http://localhost/api/admin/comments/${replyId}/purge`, adminCookie, "DELETE"), { params: Promise.resolve({ id: replyId }) })).status, 200);
    replyId = "";
  } finally {
    if (postId) await prisma.post.deleteMany({ where: { id: postId } });
    if (rateKeys.length) await prisma.commentRateLimit.deleteMany({ where: { key: { in: rateKeys } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});

test("invited users register, reset passwords and lose access when disabled", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminEmail = `lifecycle-admin-${suffix}@example.test`;
  const userEmail = `lifecycle-user-${suffix}@example.test`;
  const address = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  let adminId = "";
  let userId = "";

  const loginRequest = (email: string, password: string, audience: "ADMIN" | "USER") => new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": address },
    body: JSON.stringify({ email, password, audience }),
  });

  try {
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash: await hashPassword("AdminPassword2026"), role: "ADMIN", emailVerifiedAt: new Date() },
      select: { id: true },
    });
    adminId = admin.id;
    const adminLogin = await login(loginRequest(adminEmail, "AdminPassword2026", "ADMIN"));
    const adminCookie = adminLogin.headers.get("set-cookie")?.split(";", 1)[0];
    assert.equal(adminLogin.status, 200);
    if (!adminCookie) throw new Error("Admin session cookie is missing");

    const invitationResponse = await createInvitation(new Request("http://localhost/api/admin/users/invitations", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ email: userEmail }),
    }));
    assert.equal(invitationResponse.status, 201);
    const invitationUrl = ((await invitationResponse.json()) as { data: { invitationUrl: string } }).data.invitationUrl;
    const invitationToken = new URL(invitationUrl).searchParams.get("token");
    assert.ok(invitationToken);

    const acceptResponse = await acceptInvitationRoute(new Request("http://localhost/api/auth/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invitationToken, password: "ReaderPassword2026" }),
    }));
    assert.equal(acceptResponse.status, 201);
    const userCookie = acceptResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (!userCookie) throw new Error("User session cookie is missing");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
    userId = user.id;
    assert.equal(user.role, "USER");
    assert.ok(user.emailVerifiedAt);

    const forbiddenAdminMutation = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ title: "Forbidden", slug: `forbidden-${suffix}`, contentMd: "Denied", status: "DRAFT" }),
    }));
    assert.equal(forbiddenAdminMutation.status, 401);

    const resetResponse = await createPasswordReset(new Request(`http://localhost/api/admin/users/${userId}/password-reset`, {
      method: "POST", headers: { cookie: adminCookie },
    }), { params: Promise.resolve({ id: userId }) });
    assert.equal(resetResponse.status, 201);
    const resetUrl = ((await resetResponse.json()) as { data: { resetUrl: string } }).data.resetUrl;
    const resetToken = new URL(resetUrl).searchParams.get("token");
    assert.ok(resetToken);
    const passwordReset = await resetPasswordRoute(new Request("http://localhost/api/auth/password-reset", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "UpdatedPassword2026" }),
    }));
    assert.equal(passwordReset.status, 200);
    assert.equal((await login(loginRequest(userEmail, "ReaderPassword2026", "USER"))).status, 401);
    const newLogin = await login(loginRequest(userEmail, "UpdatedPassword2026", "USER"));
    assert.equal(newLogin.status, 200);
    const newUserCookie = newLogin.headers.get("set-cookie")?.split(";", 1)[0];
    if (!newUserCookie) throw new Error("Updated user session cookie is missing");

    const disableResponse = await updateUserStatus(new Request(`http://localhost/api/admin/users/${userId}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ status: "DISABLED" }),
    }), { params: Promise.resolve({ id: userId }) });
    assert.equal(disableResponse.status, 200);
    assert.equal((await login(loginRequest(userEmail, "UpdatedPassword2026", "USER"))).status, 401);
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.loginThrottle.deleteMany({ where: { key: { in: [loginThrottleKey(loginRequest(adminEmail, "x", "ADMIN"), adminEmail), loginThrottleKey(loginRequest(userEmail, "x", "USER"), userEmail)] } } });
    await prisma.$disconnect();
  }
});

test("database sessions can be revoked and disabled accounts lose access", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `session-${suffix}@example.test`;
  const address = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  let userId = "";
  let postId = "";
  let throttleKey = "";

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;

    const loginRequest = () => new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": address },
      body: JSON.stringify({ email, password: "correct-horse-battery-staple" }),
    });
    throttleKey = loginThrottleKey(loginRequest(), email);
    const loginResponse = await login(loginRequest());
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    if (!cookie?.startsWith(`${SESSION_COOKIE_NAME}=`)) throw new Error("Database session cookie is missing");
    const rawToken = parseCookie(cookie)[SESSION_COOKIE_NAME];
    assert.ok(rawToken);

    const session = await prisma.userSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(rawToken) },
      select: { revokedAt: true, userId: true },
    });
    assert.equal(session.userId, userId);
    assert.equal(session.revokedAt, null);

    const createResponse = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Session boundary", slug: `session-${suffix}`, contentMd: "Session test", status: "DRAFT" }),
    }));
    assert.equal(createResponse.status, 201);
    postId = ((await createResponse.json()) as { data: { post: { id: string } } }).data.post.id;

    const logoutResponse = await logout(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie, origin: "http://localhost" },
    }));
    assert.equal(logoutResponse.status, 200);
    assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(rawToken) } })).revokedAt);

    const revokedResponse = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Revoked", slug: `revoked-${suffix}`, contentMd: "Denied", status: "DRAFT" }),
    }));
    assert.equal(revokedResponse.status, 401);

    const secondLogin = await login(loginRequest());
    const secondCookie = secondLogin.headers.get("set-cookie")?.split(";", 1)[0];
    assert.equal(secondLogin.status, 200);
    if (!secondCookie) throw new Error("Second database session cookie is missing");
    await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });

    const disabledResponse = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: secondCookie },
      body: JSON.stringify({ title: "Disabled", slug: `disabled-${suffix}`, contentMd: "Denied", status: "DRAFT" }),
    }));
    assert.equal(disabledResponse.status, 401);
    assert.equal((await login(loginRequest())).status, 401);
  } finally {
    if (postId) await prisma.post.deleteMany({ where: { id: postId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (throttleKey) await prisma.loginThrottle.deleteMany({ where: { key: throttleKey } });
    await prisma.$disconnect();
  }
});

function pcmWav() {
  const dataSize = 8_000;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(8_000, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

test("authenticated article lifecycle integrates taxonomy, search and soft deletion", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `phase1b-${suffix}@example.test`;
  const slug = `phase1b-${suffix}`;
  let userId = "";
  let postId = "";
  let throttleKey = "";

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword("correct-horse-battery-staple"), role: "ADMIN" },
      select: { id: true },
    });
    userId = user.id;

    const loginResponse = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery-staple" }),
    }));
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const createResponse = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        title: "Phase 1B Prisma 搜索",
        slug,
        excerpt: "用于验证分类和标签",
        contentMd: "正文包含 integration-keyword",
        status: "PUBLISHED",
        category: "技术",
        tags: ["Next.js", "Prisma"],
      }),
    }));
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as { data: { post: { id: string } } };
    postId = created.data.post.id;
    const indexedChunks = await prisma.aiContentChunk.findMany({ where: { postId }, orderBy: { chunkIndex: "asc" } });
    assert.ok(indexedChunks.length > 0);
    assert.match(indexedChunks[0].content, /integration-keyword/);
    assert.equal(indexedChunks[0].embedding, null);

    const publicResponse = await listPublicPosts(new Request(`http://localhost/api/posts?q=integration-keyword&category=${encodeURIComponent("技术")}&tag=prisma`));
    assert.equal(publicResponse.status, 200);
    const publicBody = await publicResponse.json() as { data: { posts: Array<{ id: string }> } };
    assert.deepEqual(publicBody.data.posts.map(({ id }) => id), [postId]);

    const deleteResponse = await deletePost(
      new Request(`http://localhost/api/admin/posts/${postId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ id: postId }) },
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(await prisma.post.count({ where: { id: postId, deletedAt: null } }), 0);
    assert.equal(await prisma.aiContentChunk.count({ where: { postId } }), 0);

    const hiddenResponse = await listPublicPosts(new Request("http://localhost/api/posts?q=integration-keyword"));
    const hiddenBody = await hiddenResponse.json() as { data: { posts: Array<{ id: string }> } };
    assert.equal(hiddenBody.data.posts.length, 0);

    const restoreResponse = await restorePost(
      new Request(`http://localhost/api/admin/posts/${postId}/restore`, { method: "POST", headers: { cookie } }),
      { params: Promise.resolve({ id: postId }) },
    );
    assert.equal(restoreResponse.status, 200);
    const restored = await prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { deletedAt: true, status: true } });
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.status, "DRAFT");
    assert.equal(await prisma.aiContentChunk.count({ where: { postId } }), 0);

    const blockedEmail = `blocked-${suffix}@example.test`;
    const blockedRequest = () => new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: blockedEmail, password: "definitely-wrong-password" }),
    });
    throttleKey = loginThrottleKey(blockedRequest(), blockedEmail);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await login(blockedRequest())).status, 401);
    }
    const limitedResponse = await login(blockedRequest());
    assert.equal(limitedResponse.status, 429);
    assert.ok(Number(limitedResponse.headers.get("retry-after")) > 0);
  } finally {
    if (postId) await prisma.post.deleteMany({ where: { id: postId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (throttleKey) await prisma.loginThrottle.deleteMany({ where: { key: throttleKey } });
    await prisma.category.deleteMany({ where: { posts: { none: {} } } });
    await prisma.tag.deleteMany({ where: { posts: { none: {} } } });
    await prisma.$disconnect();
  }
});

test("permanent deletion is restricted to trashed posts", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `purge-${suffix}@example.test`;
  let userId = "";
  let activePostId = "";
  let trashedPostId = "";
  let assetId = "";

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword("correct-horse-battery-staple"), role: "ADMIN" },
      select: { id: true },
    });
    userId = user.id;

    const loginResponse = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery-staple" }),
    }));
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const [activePost, trashedPost] = await Promise.all([
      prisma.post.create({
        data: { title: "Active purge guard", slug: `active-${suffix}`, contentMd: "active", authorId: userId },
        select: { id: true },
      }),
      prisma.post.create({
        data: {
          title: "Trashed purge target",
          slug: `trashed-${suffix}`,
          contentMd: "trashed",
          authorId: userId,
          deletedAt: new Date(),
        },
        select: { id: true },
      }),
    ]);
    activePostId = activePost.id;
    trashedPostId = trashedPost.id;

    const asset = await prisma.asset.create({
      data: {
        ossKey: `purge-${suffix}.png`,
        url: `/uploads/purge-${suffix}.png`,
        mime: "image/png",
        size: 1,
        sha256: "a".repeat(64),
        ownerId: userId,
        refCount: 1,
        refs: { create: { postId: trashedPostId } },
      },
      select: { id: true },
    });
    assetId = asset.id;

    const activeResponse = await purgePost(
      new Request(`http://localhost/api/admin/posts/${activePostId}/purge`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ id: activePostId }) },
    );
    assert.equal(activeResponse.status, 409);
    assert.equal(await prisma.post.count({ where: { id: activePostId } }), 1);

    const purgeResponse = await purgePost(
      new Request(`http://localhost/api/admin/posts/${trashedPostId}/purge`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ id: trashedPostId }) },
    );
    assert.equal(purgeResponse.status, 200);
    assert.equal(await prisma.post.count({ where: { id: trashedPostId } }), 0);
    assert.equal(await prisma.postAssetRef.count({ where: { assetId } }), 0);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 0);
    trashedPostId = "";
  } finally {
    await prisma.post.deleteMany({ where: { id: { in: [activePostId, trashedPostId].filter(Boolean) } } });
    if (assetId) await prisma.asset.deleteMany({ where: { id: assetId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("media upload, article references and protected deletion work end to end", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `media-${suffix}@example.test`;
  const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "blog-media-integration-"));
  const previousUploadRoot = process.env.UPLOAD_ROOT;
  const previousStorageQuota = process.env.MAX_MEDIA_STORAGE_BYTES;
  let userId = "";
  let postId = "";
  let assetId = "";
  let audioAssetId = "";
  let documentAssetId = "";

  process.env.UPLOAD_ROOT = uploadRoot;
  process.env.MAX_MEDIA_STORAGE_BYTES = String(2 * 1024 * 1024 * 1024);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword("correct-horse-battery-staple"), role: "ADMIN" },
      select: { id: true },
    });
    userId = user.id;

    const loginResponse = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery-staple" }),
    }));
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const formData = new FormData();
    formData.set("file", new File([PNG_1X1], "pixel.png", { type: "image/png" }));
    const uploadResponse = await uploadAsset(new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", "content-length": "1024" },
      body: formData,
    }));
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json() as { data: { asset: { id: string; url: string } } };
    assetId = uploaded.data.asset.id;
    const storedPath = path.join(uploadRoot, ...uploaded.data.asset.url.replace("/uploads/", "").split("/"));
    await access(storedPath);

    const audioFormData = new FormData();
    audioFormData.set("file", new File([pcmWav()], "field-note.wav", { type: "audio/wav" }));
    const audioUploadResponse = await uploadAsset(new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", "content-length": "9000" },
      body: audioFormData,
    }));
    assert.equal(audioUploadResponse.status, 201);
    const audioUploaded = await audioUploadResponse.json() as {
      data: { asset: { id: string; url: string; kind: string; durationMs: number | null } };
    };
    audioAssetId = audioUploaded.data.asset.id;
    assert.equal(audioUploaded.data.asset.kind, "AUDIO");
    assert.equal(audioUploaded.data.asset.durationMs, 1000);
    const audioStoredPath = path.join(uploadRoot, ...audioUploaded.data.asset.url.replace("/uploads/", "").split("/"));
    await access(audioStoredPath);

    const documentFormData = new FormData();
    documentFormData.set("file", new File(["# Packing list\n\n- recorder\n"], "packing-list.md", { type: "text/markdown" }));
    const documentUploadResponse = await uploadAsset(new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", "content-length": "512" },
      body: documentFormData,
    }));
    assert.equal(documentUploadResponse.status, 201);
    const documentUploaded = await documentUploadResponse.json() as {
      data: { asset: { id: string; url: string; kind: string; mime: string } };
    };
    documentAssetId = documentUploaded.data.asset.id;
    assert.equal(documentUploaded.data.asset.kind, "DOCUMENT");
    assert.equal(documentUploaded.data.asset.mime, "text/markdown");
    const documentStoredPath = path.join(uploadRoot, ...documentUploaded.data.asset.url.replace("/uploads/", "").split("/"));
    await access(documentStoredPath);

    const createResponse = await createPost(new Request("http://localhost/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        title: "Media lifecycle",
        slug: `media-${suffix}`,
        contentMd: `![pixel](${uploaded.data.asset.url})\n\n[audio:field note](${audioUploaded.data.asset.url})\n\n[Packing list](${documentUploaded.data.asset.url})`,
        status: "DRAFT",
        assetIds: [assetId, audioAssetId, documentAssetId],
      }),
    }));
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as { data: { post: { id: string } } };
    postId = created.data.post.id;
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 1);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: audioAssetId } })).refCount, 1);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: documentAssetId } })).refCount, 1);

    const blockedDelete = await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${assetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: assetId }) },
    );
    assert.equal(blockedDelete.status, 409);
    const blockedAudioDelete = await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${audioAssetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: audioAssetId }) },
    );
    assert.equal(blockedAudioDelete.status, 409);
    const blockedDocumentDelete = await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${documentAssetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: documentAssetId }) },
    );
    assert.equal(blockedDocumentDelete.status, 409);

    const protectedDetachResponse = await updatePost(
      new Request(`http://localhost/api/admin/posts/${postId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
        body: JSON.stringify({ assetIds: [] }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    assert.equal(protectedDetachResponse.status, 200);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 1);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: audioAssetId } })).refCount, 1);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: documentAssetId } })).refCount, 1);

    const detachResponse = await updatePost(
      new Request(`http://localhost/api/admin/posts/${postId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
        body: JSON.stringify({ contentMd: "Media reference removed.", assetIds: [] }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    assert.equal(detachResponse.status, 200);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).refCount, 0);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: audioAssetId } })).refCount, 0);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: documentAssetId } })).refCount, 0);

    process.env.MAX_MEDIA_STORAGE_BYTES = "1";
    const quotaFormData = new FormData();
    quotaFormData.set("file", new File(["quota check"], "quota.txt", { type: "text/plain" }));
    const quotaResponse = await uploadAsset(new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", "content-length": "256" },
      body: quotaFormData,
    }));
    assert.equal(quotaResponse.status, 507);
    process.env.MAX_MEDIA_STORAGE_BYTES = String(2 * 1024 * 1024 * 1024);

    const deleteResponse = await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${assetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: assetId }) },
    );
    assert.equal(deleteResponse.status, 200);

    const restoreResponse = await restoreAsset(
      new Request(`http://localhost/api/admin/assets/${assetId}/restore`, { method: "POST", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: assetId }) },
    );
    assert.equal(restoreResponse.status, 200);

    assert.equal((await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${assetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: assetId }) },
    )).status, 200);
    const purgeResponse = await purgeAsset(
      new Request(`http://localhost/api/admin/assets/${assetId}/purge`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: assetId }) },
    );
    assert.equal(purgeResponse.status, 200);
    assert.equal(await prisma.asset.count({ where: { id: assetId } }), 0);
    await assert.rejects(access(storedPath));
    assetId = "";

    assert.equal((await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${audioAssetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: audioAssetId }) },
    )).status, 200);
    assert.equal((await purgeAsset(
      new Request(`http://localhost/api/admin/assets/${audioAssetId}/purge`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: audioAssetId }) },
    )).status, 200);
    await assert.rejects(access(audioStoredPath));
    audioAssetId = "";

    assert.equal((await deleteAsset(
      new Request(`http://localhost/api/admin/assets/${documentAssetId}`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: documentAssetId }) },
    )).status, 200);
    assert.equal((await purgeAsset(
      new Request(`http://localhost/api/admin/assets/${documentAssetId}/purge`, { method: "DELETE", headers: { cookie, origin: "http://localhost" } }),
      { params: Promise.resolve({ id: documentAssetId }) },
    )).status, 200);
    await assert.rejects(access(documentStoredPath));
    documentAssetId = "";
  } finally {
    if (postId) await prisma.post.deleteMany({ where: { id: postId } });
    if (assetId) await prisma.asset.deleteMany({ where: { id: assetId } });
    if (audioAssetId) await prisma.asset.deleteMany({ where: { id: audioAssetId } });
    if (documentAssetId) await prisma.asset.deleteMany({ where: { id: documentAssetId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (previousUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previousUploadRoot;
    if (previousStorageQuota === undefined) delete process.env.MAX_MEDIA_STORAGE_BYTES;
    else process.env.MAX_MEDIA_STORAGE_BYTES = previousStorageQuota;
    await rm(uploadRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
