import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { GET as getCopy, PUT as saveCopy } from "@/app/api/admin/working-copies/[key]/route";
import { GET as history } from "@/app/api/admin/posts/[id]/revisions/route";
import { POST as createPost } from "@/app/api/admin/posts/route";
import { PATCH as updatePost, DELETE as deletePost } from "@/app/api/admin/posts/[id]/route";
import { hashPassword, issueUserSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { editorState } from "@/lib/editor-state";
import { recordPostRevision, REVISION_LIMIT } from "@/lib/post-revisions";

const db = new PrismaClient();
test("editor autosave is private, conflict-safe and isolated from published posts", async () => {
  const suffix = `${Date.now()}`;
  const users: string[] = [];
  let postId = "";
  const context = (key: string) => ({ params: Promise.resolve({ key }) });
  const route = () => ({ params: Promise.resolve({ id: postId }) });
  const request = (path: string, token: string, method = "GET", body?: unknown, origin = "http://localhost") => new Request(`http://localhost${path}`, {
    method, headers: { ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}), "content-type": "application/json", origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const passwordHash = await hashPassword("Integration-only-123456");
    const tokens: string[] = [];
    for (const role of ["ADMIN", "ADMIN", "USER"] as const) {
      const user = await db.user.create({ data: { email: `editor-${users.length}-${suffix}@example.test`, role, passwordHash } });
      users.push(user.id); tokens.push((await issueUserSession(user.id)).token);
    }
    const [admin, otherAdmin, reader] = tokens;
    const path = "/api/admin/working-copies/new";
    const unfinished = editorState({ title: "", slug: "", excerpt: "", contentMd: "Private autosave", status: "DRAFT", category: "", tags: [], assetIds: [], placeIds: [] });
    const payload = { state: unfinished, version: 0, baseUpdatedAt: null };
    assert.equal((await saveCopy(request(path, "", "PUT", payload), context("new"))).status, 401);
    assert.equal((await saveCopy(request(path, reader, "PUT", payload), context("new"))).status, 401);
    assert.equal((await saveCopy(request(path, admin, "PUT", payload, "https://evil.test"), context("new"))).status, 403);
    const first = await saveCopy(request(path, admin, "PUT", payload), context("new"));
    assert.equal(first.status, 200);
    assert.equal(await db.post.count({ where: { authorId: users[0] } }), 0);
    assert.equal((await (await getCopy(request(path, otherAdmin), context("new"))).json()).data.copy, null);
    assert.equal((await saveCopy(request(path, admin, "PUT", payload), context("new"))).status, 409);
    const concurrent = await Promise.all([1, 2].map((n) => saveCopy(request(path, admin, "PUT", { ...payload, version: 1, state: { ...unfinished, tagsText: `${n}` } }), context("new"))));
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);

    const input = { ...unfinished.form, title: "Public post", slug: `editor-${suffix}`, contentMd: "Public body", status: "PUBLISHED", workingCopyVersion: 2 };
    const created = await createPost(request("/api/admin/posts", admin, "POST", input));
    assert.equal(created.status, 201);
    const post = (await created.json()).data.post;
    postId = post.id;
    const tombstone = (await (await getCopy(request(path, admin), context("new"))).json()).data.copy;
    assert.equal(tombstone.cleared, true);
    assert.equal(tombstone.version, 3);
    assert.equal((await saveCopy(request(path, admin, "PUT", payload), context("new"))).status, 409);

    const copyPath = `/api/admin/working-copies/${postId}`;
    const working = { ...unfinished, form: { ...unfinished.form, title: "Unpublished edit", slug: input.slug, contentMd: "Private new body", status: "PUBLISHED" as const } };
    assert.equal((await saveCopy(request(copyPath, admin, "PUT", { state: working, version: 0, baseUpdatedAt: post.updatedAt }), context(postId))).status, 200);
    assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).contentMd, "Public body");
    const chunks = await db.aiContentChunk.findMany({ where: { postId } });
    assert.equal(JSON.stringify(chunks).includes("Private new body"), false);
    const badUpdate = await updatePost(request(`/api/admin/posts/${postId}`, admin, "PATCH", { contentMd: "Overwrite", expectedUpdatedAt: "2000-01-01T00:00:00.000Z", workingCopyVersion: 1 }), route());
    assert.equal(badUpdate.status, 409);
    assert.equal((await db.postWorkingCopy.findFirstOrThrow({ where: { postId } })).cleared, false);
    const updated = await updatePost(request(`/api/admin/posts/${postId}`, admin, "PATCH", { contentMd: "New saved body", expectedUpdatedAt: post.updatedAt, workingCopyVersion: 1 }), route());
    assert.equal(updated.status, 200);
    assert.equal((await history(request(`/api/admin/posts/${postId}/revisions`, reader), route())).status, 401);
    const versions = (await (await history(request(`/api/admin/posts/${postId}/revisions`, admin), route())).json()).data.revisions;
    assert.equal(versions.length, 2);
    const old = (await (await history(request(`/api/admin/posts/${postId}/revisions?revision=${versions[1].id}`, admin), route())).json()).data.revision;
    assert.equal(old.payload.form.contentMd, "Public body");
    assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).contentMd, "New saved body");
    await db.$transaction(async (tx) => { await recordPostRevision(tx, postId); });
    assert.equal(await db.postRevision.count({ where: { postId } }), 2);
    for (let index = 0; index < 22; index++) {
      const response = await updatePost(request(`/api/admin/posts/${postId}`, admin, "PATCH", { contentMd: `Version ${index}` }), route());
      assert.equal(response.status, 200);
    }
    assert.equal(await db.postRevision.count({ where: { postId } }), REVISION_LIMIT);
    const malformed = await db.postRevision.create({ data: { postId, payload: { legacy: true } } });
    const legacyList = await history(request(`/api/admin/posts/${postId}/revisions`, admin), route());
    assert.equal(legacyList.status, 200);
    assert.match(JSON.stringify(await legacyList.json()), /旧格式版本/);
    assert.equal((await updatePost(request(`/api/admin/posts/${postId}`, admin, "PATCH", { contentMd: "After legacy snapshot" }), route())).status, 200);
    await db.postRevision.deleteMany({ where: { id: malformed.id } });
    assert.equal((await deletePost(request(`/api/admin/posts/${postId}`, admin, "DELETE"), route())).status, 200);
    assert.equal((await getCopy(request(copyPath, admin), context(postId))).status, 404);
    assert.equal((await history(request(`/api/admin/posts/${postId}/revisions`, admin), route())).status, 404);
    assert.equal((await saveCopy(request(copyPath, admin, "PUT", { state: working, version: 2, baseUpdatedAt: post.updatedAt }), context(postId))).status, 409);
    await db.post.delete({ where: { id: postId } });
    assert.equal(await db.postRevision.count({ where: { postId } }), 0);
  } finally {
    if (postId) await db.post.deleteMany({ where: { id: postId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
