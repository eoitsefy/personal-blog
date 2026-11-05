import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "@/app/api/music/route";
import { GET as devGet, POST as devPost } from "@/app/api/dev/music/route";

function checkHeaders(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
}

test("retired real handlers ignore credentials and bodies, never call provider", async () => {
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => { outboundCalls++; throw new Error("unexpected network call"); };
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    const blockedRequest = new Proxy(new Request("http://localhost/api/music"), { get() { throw new Error("request must not be read"); } });
    assert.equal((await GET(blockedRequest)).status, 200);
    assert.equal((await POST(blockedRequest)).status, 410);
    const input = new Request("http://localhost/api/music", { headers: { cookie: "blog_session=private-fixture" } });
    const response = await GET(input);
    assert.equal(response.status, 200); checkHeaders(response);
    assert.deepEqual(await response.json(), { ok: true, mode: "official-embed", ready: true, message: "音乐已改用网易云官方播放器。" });
    for (const action of ["search", "play", "login-start", "login-check", "unknown"]) {
      const request = new Request("http://localhost/api/music", { method: "POST", headers: { cookie: "blog_session=private-fixture", "content-type": "application/json", origin: "https://other.example" }, body: JSON.stringify({ action }) });
      const result = await POST(request);
      assert.equal(request.bodyUsed, false); assert.equal(result.status, 410); checkHeaders(result);
      assert.deepEqual(await result.json(), { ok: false, code: "MUSIC_EMBED_ONLY", message: "音乐已改用网易云官方播放器，请刷新音乐页。" });
    }
    Object.assign(process.env, { NODE_ENV: "development" });
    const local = new Request("http://localhost/api/dev/music", { headers: { host: "localhost" } });
    assert.equal((await devGet(local)).status, 200);
    const localPost = new Request("http://localhost/api/dev/music", { method: "POST", headers: { host: "localhost" }, body: "not json" });
    assert.equal((await devPost(localPost)).status, 410); assert.equal(localPost.bodyUsed, false);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal((await devGet(local)).status, 404);
    assert.equal((await devPost(localPost)).status, 404);
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
  }
});
