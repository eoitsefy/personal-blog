import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { POST as createPost } from "@/app/api/admin/posts/route";
import { DELETE as deletePost } from "@/app/api/admin/posts/[id]/route";
import { POST as restorePost } from "@/app/api/admin/posts/[id]/restore/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listPublicPosts } from "@/app/api/posts/route";
import { hashPassword } from "@/lib/auth";
import { loginThrottleKey } from "@/lib/login-throttle";

const prisma = new PrismaClient();

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
