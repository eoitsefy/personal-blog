import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";

const fixture = { code: 200, result: { songs: [{ id: 22636694, name: "Song", artists: [{ name: "Artist" }], album: { name: "Album" }, url: "https://bad.invalid/secret" }] } };
async function load(entry: string) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "server-only-stub", setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "", loader: "js" })); } }] });
  const loaded = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(process.cwd() + "/package.json"), loaded, loaded.exports); return loaded.exports;
}

test("service handles bounded caching, deduplication, failures, privacy and limits", async () => {
  const { createMusicSearchService } = await load("src/lib/music/music-search.server.ts") as typeof import("./music-search.server");
  let clock = 1_000_000, count = 0; const calls: { url: URL; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => { count++; calls.push({ url: new URL(String(input)), init }); return Response.json(fixture); };
  const service = createMusicSearchService({ fetcher, now: () => clock, cacheMax: 2 });
  await Promise.all([service.search("one", "ip-a"), service.search("one", "ip-b")]); assert.equal(count, 1);
  const first = await service.search("one", "ip-a"); assert.equal(count, 1); assert.equal(first[0].url, "https://music.163.com/#/song?id=22636694");
  assert.equal(calls[0].url.origin, "https://music.163.com"); assert.equal(calls[0].url.pathname, "/api/search/get");
  assert.equal(calls[0].init?.credentials, "omit"); assert.equal(calls[0].init?.redirect, "error"); assert.equal(calls[0].init?.headers, undefined);
  await service.search("two", "ip-a"); await service.search("three", "ip-a"); await service.search("one", "ip-a"); assert.equal(count, 4);
  clock += 300_001; await service.search("one", "ip-a"); assert.equal(count, 5);
  let failures = 0; const failed = createMusicSearchService({ fetcher: async () => { failures++; return new Response("blocked", { status: 401 }); } });
  await assert.rejects(failed.search("one", "ip"), { reason: "UPSTREAM" }); await assert.rejects(failed.search("one", "ip"), { reason: "UPSTREAM" }); assert.equal(failures, 2);
  let rejected429 = 0; const throttled = createMusicSearchService({ fetcher: async () => { rejected429++; return new Response("limited", { status: 429 }); } });
  await assert.rejects(throttled.search("x", "ip"), { reason: "UPSTREAM" }); assert.equal(rejected429, 1);
  const html = createMusicSearchService({ fetcher: async () => new Response("<html>not search JSON</html>") }); await assert.rejects(html.search("x", "ip"), { reason: "UPSTREAM" });
  let emptyCount = 0; let emptyClock = 1_000_000; const empty = createMusicSearchService({ now: () => emptyClock, fetcher: async () => { emptyCount++; return Response.json({ code: 200, result: { songCount: 0 } }); } });
  await empty.search("empty", "ip"); await empty.search("empty", "ip"); assert.equal(emptyCount, 1); emptyClock += 30_001; await empty.search("empty", "ip"); assert.equal(emptyCount, 2);
  const big = createMusicSearchService({ fetcher: async () => new Response("x".repeat(512 * 1024 + 1)) }); await assert.rejects(big.search("x", "ip"), { reason: "UPSTREAM" });
  const timeout = createMusicSearchService({ timeoutMs: 15, fetcher: async (_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("abort")))) }); await assert.rejects(timeout.search("x", "ip"), { reason: "TIMEOUT" });
  const releases: Array<() => void> = []; const busy = createMusicSearchService({ inflightMax: 2, fetcher: async () => { await new Promise<void>(resolve => releases.push(resolve)); return Response.json(fixture); } });
  const a = busy.search("a", "ip"), b = busy.search("b", "ip"); await assert.rejects(busy.search("c", "ip"), { reason: "BUSY" }); releases.forEach(fn => fn()); await Promise.all([a, b]);
  const perSource = createMusicSearchService({ fetcher }); for (let i = 0; i < 30; i++) await perSource.search("same", "limited-ip"); await assert.rejects(perSource.search("same", "limited-ip"), { reason: "RATE_LIMITED" });
  const global = createMusicSearchService({ fetcher, now: () => 0 }); for (let i = 0; i < 60; i++) await global.search(`term-${i}`, `source-${i}`); await assert.rejects(global.search("term-last", "new-source"), { reason: "RATE_LIMITED" });
});

test("actual HTTP route validates bodies and forwards no incoming credentials", async () => {
  const original = globalThis.fetch; let count = 0; let observed: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => { count++; observed = init; return Response.json(fixture); };
  try {
    const { POST } = await load("src/app/api/music/search/route.ts") as typeof import("@/app/api/music/search/route");
    const req = (body: string, origin = "http://localhost") => new Request("http://localhost/api/music/search", { method: "POST", headers: { origin, "content-type": "application/json", cookie: "private-cookie=never-forward", "x-real-ip": "192.0.2.42" }, body });
    assert.equal((await POST(req("{"))).status, 400);
    assert.equal((await POST(req(JSON.stringify({ query: "x".repeat(1100) })))).status, 413);
    assert.equal((await POST(req(JSON.stringify({ query: "x" }), "https://other.example"))).status, 403);
    for (const site of ["cross-site", "same-site"]) {
      const cross = new Request("http://localhost/api/music/search", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "sec-fetch-site": site }, body: JSON.stringify({ query: "x" }) });
      assert.equal((await POST(cross)).status, 403);
      assert.equal(count, 0);
    }
    assert.equal((await POST(req(JSON.stringify({ query: "bad\nquery" })))).status, 400);
    const response = await POST(req(JSON.stringify({ query: " Song " }))); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
    const body = await response.json(); assert.equal(body.songs[0].url, "https://music.163.com/#/song?id=22636694");
    assert.equal(count, 1); assert.equal(observed?.headers, undefined); assert.equal(observed?.credentials, "omit");
  } finally { globalThis.fetch = original; }
});
