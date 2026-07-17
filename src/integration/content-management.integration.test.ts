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
import { GET as listPublicPosts } from "@/app/api/posts/route";
import { hashPassword } from "@/lib/auth";
import { loginThrottleKey } from "@/lib/login-throttle";

const prisma = new PrismaClient();
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZsAAAAASUVORK5CYII=",
  "base64",
);

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

  process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";

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

  process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";

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

  process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";
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
