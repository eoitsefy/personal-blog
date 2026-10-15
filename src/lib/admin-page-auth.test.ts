import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { isValidElement } from "react";
import UsersPage from "../app/admin/(protected)/users/page";
import CommentsPage from "../app/admin/(protected)/comments/page";
import { prisma } from "./prisma";

// Mock the request/DB boundary, keeping the actual page, admin guard, role check,
// and Next redirect implementation. No database or Next server is needed here.
const headers = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
const fixtureDate = new Date("2026-01-01T12:00:00.000Z");
const user = {
  id: "fixture-user", email: "private-user@example.invalid", role: "USER", status: "ACTIVE",
  emailVerifiedAt: fixtureDate, createdAt: fixtureDate, _count: { sessions: 2 },
};
const comment = {
  id: "fixture-comment", content: "private-moderation-fixture", status: "PENDING",
  deletedAt: null, createdAt: fixtureDate, editedAt: null, parentId: null,
  author: { email: user.email },
  post: { id: "fixture-post", title: "Fixture post", slug: "fixture-post", commentsLocked: false },
  reports: [{ id: "fixture-report", reason: "private-report-fixture", status: "OPEN", reporter: { email: "reporter@example.invalid" } }],
};
const routes = [
  { name: "users", render: () => UsersPage(), marker: user.email },
  { name: "comments", render: () => CommentsPage({ searchParams: Promise.resolve({}) }), marker: comment.content },
];

// Prisma delegates are proxies whose property descriptors have undefined values,
// so node:test's mock.method cannot replace them directly.
function mockQuery(t: TestContext, delegate: object, method: string, implementation: () => unknown) {
  const original = Reflect.get(delegate, method);
  const query = t.mock.fn(implementation);
  Reflect.set(delegate, method, query);
  t.after(() => { Reflect.set(delegate, method, original); });
  return query;
}

for (const route of routes) {
  for (const role of [null, "USER", "ADMIN"] as const) {
    test(`${route.name} page ${role ?? "anonymous"} access protects sensitive queries`, async (t) => {
      t.mock.method(headers, "cookies", async () => ({
        get: () => role ? { value: "a".repeat(43) } : undefined,
      }));
      const sessionLookup = mockQuery(t, prisma.userSession, "findUnique", async () => ({
        id: "fixture-session", revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(),
        user: { ...user, role },
      }));
      // Even if a regression reaches the DB, it only receives synthetic rows.
      const usersQuery = mockQuery(t, prisma.user, "findMany", async () => [user]);
      const commentsCount = mockQuery(t, prisma.comment, "count", async () => 1);
      const commentsQuery = mockQuery(t, prisma.comment, "findMany", async () => [comment]);

      if (role !== "ADMIN") {
        await assert.rejects(route.render(), (error: unknown) => {
          assert.ok(error instanceof Error && "digest" in error);
          assert.equal(error.digest, "NEXT_REDIRECT;replace;/admin/login;307;");
          return true;
        });
        assert.equal(usersQuery.mock.callCount(), 0);
        assert.equal(commentsCount.mock.callCount(), 0);
        assert.equal(commentsQuery.mock.callCount(), 0);
      } else {
        const tree = await route.render();
        const serialized = JSON.stringify(tree, (_key, value) => isValidElement(value) ? value.props : value);
        assert.ok(serialized.includes(route.marker));
        assert.ok(serialized.includes(fixtureDate.toISOString()));
        assert.equal(usersQuery.mock.callCount(), route.name === "users" ? 1 : 0);
        assert.equal(commentsCount.mock.callCount(), route.name === "comments" ? 1 : 0);
        assert.equal(commentsQuery.mock.callCount(), route.name === "comments" ? 1 : 0);
      }
      assert.equal(sessionLookup.mock.callCount(), role ? 1 : 0);
    });
  }

  test(`${route.name} page waits for authorization before querying`, async (t) => {
    t.mock.method(headers, "cookies", async () => ({ get: () => ({ value: "a".repeat(43) }) }));
    let finishLookup!: (value: null) => void;
    const pendingSession = new Promise<null>((resolve) => { finishLookup = resolve; });
    mockQuery(t, prisma.userSession, "findUnique", () => pendingSession);
    const usersQuery = mockQuery(t, prisma.user, "findMany", async () => [user]);
    const commentsCount = mockQuery(t, prisma.comment, "count", async () => 1);
    const commentsQuery = mockQuery(t, prisma.comment, "findMany", async () => [comment]);
    const result = route.render();
    const rejected = assert.rejects(result, { message: "NEXT_REDIRECT" });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(usersQuery.mock.callCount(), 0);
      assert.equal(commentsCount.mock.callCount(), 0);
      assert.equal(commentsQuery.mock.callCount(), 0);
    } finally {
      finishLookup(null);
      await rejected;
    }
  });
}
