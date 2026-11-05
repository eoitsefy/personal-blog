import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { build } from "esbuild";

// Bundle the actual server module with only the Next server-only marker stubbed.
let api: typeof import("./netease.server");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = { appId: "test-app", privateKey };
const now = Date.now;
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let clock = now();
Date.now = () => clock;
let named = "test-named-token";
let profileMode: "ok" | "reject" | "forbidden" | "missing" | "network" = "ok";
let trackFail = false;
let lastProfileToken: string | null = null;
let manifestOk = false;
let calls: string[] = [];
const warnings: unknown[][] = [];
let deferredToken = "";
let unblock: (() => void) | undefined;
let profileReached: (() => void) | undefined;
console.warn = (...args) => warnings.push(args);
globalThis.fetch = async (input) => {
  const url = new URL(String(input)); const path = url.pathname; calls.push(path);
  const token = url.searchParams.get("accessToken");
  if (path.endsWith("/profile/get/v2")) {
    lastProfileToken = token;
    if (token === deferredToken) { profileReached?.(); await new Promise<void>(resolve => { unblock = resolve; }); return Response.json({ code: 301, message: "sensitive-profile" }); }
    if (profileMode === "network") throw new Error("sensitive-network-token");
    return Response.json(profileMode === "reject" ? { code: 301, message: "sensitive-provider-token" } : profileMode === "forbidden" ? { code: 403 } : profileMode === "missing" ? { code: 200 } : { code: 200, data: { privateProfile: "secret" } });
  }
  if (path.endsWith("/login/anonymous")) return Response.json({ code: 200, data: { accessToken: "test-anonymous" } });
  if (path.endsWith("/qrcodekey/get/v2")) return Response.json({ code: 200, data: { qrCodeUrl: "https://music.163.com/test", uniKey: "fake-qr-key" } });
  if (path.endsWith("/device/login/qrcode/get")) return Response.json({ code: 200, data: { status: 803, accessToken: { accessToken: named, expireTime: 3600 } } });
  if (path.endsWith("/song/detail/get/v2")) return Response.json(trackFail ? { code: 301, message: "sensitive-provider-token" } : { code: 200, data: { playUrl: "https://music.126.net/test" } });
  if (path.endsWith("/cli/manifest")) return Response.json(manifestOk ? { code: 200, manifests: { root: { sub_resources: [{ name: "search", path: "search-resource" }] }, "search-resource": { methods: [{ name: "song", path: "/openapi/music/basic/search/song/get/v3", http_method: "GET" }] } } } : { code: 301 });
  if (path.endsWith("/search/song/get/v3")) return Response.json({ code: 301 });
  throw new Error("unexpected mock path");
};

async function connect(client: ReturnType<typeof api.createNeteaseClient>) {
  await client.startNeteaseLogin(config); clock += 5000; return client.checkNeteaseLogin(config);
}

test("real client verifies 803 and classifies later failures without exposing provider data", async () => {
  try {
    const compiled = await build({ entryPoints: ["src/lib/music/netease.server.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "server-only-test-stub", setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "", loader: "js" })); } }] });
    const exportsObject: { exports: Record<string, (...args: never[]) => unknown> } = { exports: {} };
    new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(process.cwd() + "/package.json"), exportsObject, exportsObject.exports);
    api = exportsObject.exports as unknown as typeof import("./netease.server");

    const a = api.createNeteaseClient("scope-a");
    const b = api.createNeteaseClient("scope-b");
    named = "undefined";
    await assert.rejects(connect(a), (error: { code: string }) => error.code === "LOGIN_TOKEN_MISSING");
    assert.equal(a.getStatus().authenticated, false);
    named = "test-token-old"; profileMode = "reject";
    await assert.rejects(connect(a), (error: { code: string; status: number }) => error.code === "MUSIC_ACCOUNT_NOT_ALLOWED" && error.status === 403);
    assert.equal(a.getStatus().authenticated, false);
    profileMode = "forbidden";
    await assert.rejects(connect(a), (error: { code: string }) => error.code === "MUSIC_ACCOUNT_NOT_ALLOWED");
    assert.equal(a.getStatus().authenticated, false);
    profileMode = "missing";
    await assert.rejects(connect(a), (error: { code: string; status: number }) => error.code === "MUSIC_PROFILE_INVALID" && error.status === 502);
    assert.equal(a.getStatus().authenticated, false);
    profileMode = "ok"; await connect(a); assert.equal(a.getStatus().authenticated, true); assert.equal(b.getStatus().authenticated, false);
    named = "test-token-denied-other-scope"; profileMode = "reject";
    await assert.rejects(connect(b), (error: { code: string; status: number }) => error.code === "MUSIC_ACCOUNT_NOT_ALLOWED" && error.status === 403);
    assert.equal(b.getStatus().authenticated, false);
    assert.equal(a.getStatus().authenticated, true);
    trackFail = true; profileMode = "ok";
    await assert.rejects(a.getNeteaseTrack("1", config), (error: { code: string }) => error.code === "MUSIC_ACCESS_DENIED");
    assert.equal(lastProfileToken, "test-token-old");
    assert.equal(a.getStatus().authenticated, true);
    named = "test-token-old";
    profileMode = "reject";
    await assert.rejects(connect(a), (error: { code: string }) => error.code === "MUSIC_ACCOUNT_NOT_ALLOWED");
    assert.equal(a.getStatus().authenticated, false);
    profileMode = "ok"; await connect(a);
    trackFail = true; calls = [];
    await assert.rejects(a.getNeteaseTrack("1", config), (error: { code: string; status: number }) => error.code === "MUSIC_ACCESS_DENIED" && error.status === 403);
    assert.equal(calls.length, 2); assert.equal(a.getStatus().authenticated, true);
    calls = [];
    await assert.rejects(a.searchNeteaseSongs("private-search", config), (error: { code: string }) => error.code === "MUSIC_ACCESS_DENIED");
    assert.equal(calls.length, 2); assert.equal(a.getStatus().authenticated, true);
    manifestOk = true; calls = [];
    await assert.rejects(a.searchNeteaseSongs("private-search-2", config), (error: { code: string }) => error.code === "MUSIC_ACCESS_DENIED");
    assert.equal(calls.length, 3); assert.equal(a.getStatus().authenticated, true);
    profileMode = "network";
    await assert.rejects(a.getNeteaseTrack("1", config), (error: { code: string }) => error.code === "NETWORK_ERROR");
    assert.equal(a.getStatus().authenticated, true);
    profileMode = "reject";
    await assert.rejects(a.getNeteaseTrack("1", config), (error: { code: string }) => error.code === "MUSIC_LOGIN_REQUIRED");
    assert.equal(a.getStatus().authenticated, false);
    named = "test-token-old"; profileMode = "ok"; await connect(a);
    named = "test-token-other"; await connect(b); assert.equal(b.getStatus().authenticated, true);
    deferredToken = "test-token-old";
    let reached!: () => void; const waiting = new Promise<void>(resolve => { reached = resolve; }); profileReached = reached;
    const old = a.getNeteaseTrack("1", config); await waiting;
    named = "test-token-new"; await connect(a); unblock!();
    await assert.rejects(old, (error: { code: string }) => error.code === "MUSIC_CONNECTION_CHANGED");
    assert.equal(a.getStatus().authenticated, true); assert.equal(b.getStatus().authenticated, true);
    const rendered = JSON.stringify(warnings);
    for (const secret of ["sensitive", "private-search", "test-token", "fake-qr-key", "privateProfile"]) assert.equal(rendered.includes(secret), false);
    for (const args of warnings) { assert.equal(args.length, 1); assert.equal(typeof args[0], "string"); const details = JSON.parse(args[0] as string); assert.equal(details.event, "netease_upstream_failure"); assert.deepEqual(Object.keys(details).sort(), ["elapsedMs", "event", "httpStatus", "operation", "providerCode", "reference"]); }
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; Date.now = now; }
});
