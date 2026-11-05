import "server-only";
import { MusicSessions, consumeMusicBudget, type MusicBudget } from "./netease-sessions";
import { randomUUID } from "node:crypto";
import { arch, platform, release } from "node:os";
import QRCode from "qrcode";
import type { NeteaseConfig } from "./netease-config.server";
import { signNeteaseParameters } from "./netease-signing";
import { neteasePlaybackRights, neteaseProviderErrorStatus, NeteaseTrialError, safeNeteaseMediaUrl, type NeteaseSong, type NeteaseTrack, type NeteaseDiagnostic } from "./netease-trial";

type JsonObject = Record<string, unknown>;
type ApiEvent = { path: string; method: string; code: string; elapsedMs: number; httpStatus?: number; fields?: string[] };
type TrialState = {
  deviceId: string;
  calls: number;
  requestBudget: MusicBudget;
  upstreamBudget: MusicBudget;
  loginGeneration: number;
  events: ApiEvent[];
  token?: { value: string; until: number };
  tokenPending?: Promise<string>;
  namedToken?: { value: string; until: number };
  login?: { key: string; expiresAt: number; checkedAt: number; status: "waiting" | "scanned" | "authorized" | "expired" };
  manifests?: JsonObject;
  manifestPending?: Promise<JsonObject>;
  searchCache: Map<string, { until: number; songs: NeteaseSong[] }>;
  songRights?: Map<string, JsonObject>;
  searchShape?: { fields: string[]; dataFields: string[]; firstSongFields: string[] };
  trackSummary?: { fields: string[]; mediaHost?: string; mediaProtocol?: string; freeTrail?: unknown; freeTrialPrivilege?: unknown; playFlag?: unknown };
};
const musicGlobal = globalThis as typeof globalThis & {
  __siteMusicSessions?: MusicSessions<TrialState>;
  __siteMusicBudget?: MusicBudget;
};
const sessions = musicGlobal.__siteMusicSessions ??= new MusicSessions<TrialState>(() => ({
  deviceId: randomUUID(), calls: 0, events: [], searchCache: new Map(), loginGeneration: 0,
  requestBudget: { windowStart: Date.now(), calls: 0 },
  upstreamBudget: { windowStart: Date.now(), calls: 0 },
}));
const sharedBudget = musicGlobal.__siteMusicBudget ??= { windowStart: Date.now(), calls: 0 };

const object = (value: unknown): JsonObject => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

export function getNeteaseStatus(userId: string) {
  const state = sessions.peek(userId);
  return { authenticated: Boolean(state?.namedToken && state.namedToken.until > Date.now()) };
}

export function createNeteaseClient(userId: string) {
  const existing = sessions.get(userId);
  if (!existing) throw new NeteaseTrialError("音乐连接较多，请稍后再试。", "MUSIC_CAPACITY", 503);
  const state: TrialState = existing;

  function getStatus() {
    return { authenticated: Boolean(state.namedToken && state.namedToken.until > Date.now()) };
  }

  function reserveRequest() {
    if (!consumeMusicBudget(state.requestBudget, 30, 60_000)) {
      throw new NeteaseTrialError("音乐请求较多，请稍后再试。", "MUSIC_RATE_LIMIT", 429);
    }
  }

  async function officialRequest(path: string, business: JsonObject, config: NeteaseConfig, token?: string, method: "GET" | "POST" = "POST", observeStatus?: (status: number) => void) {
    if (!/^\/openapi\/[a-zA-Z0-9/_-]+$/.test(path)) throw new NeteaseTrialError("接口路径无效", "INVALID_API_PATH", 400);
    if (!consumeMusicBudget(state.upstreamBudget, 100, 60 * 60_000)
        || !consumeMusicBudget(sharedBudget, 100, 60 * 60_000)) {
      throw new NeteaseTrialError("音乐服务暂时繁忙，请稍后重试。", "MUSIC_RATE_LIMIT", 429);
    }
    state.calls += 1;
    const started = Date.now();
    // This application accepted the published official CLI parameter profile.
    // Keep the provider SDK-compatible request/signing profile. Each authenticated
    // blog account has its own device id, authorization and private caches.
    const system = platform() === "win32" ? "Windows" : platform() === "darwin" ? "Mac" : "Linux";
    const device = { deviceType: "openapi", os: "ncmcli", appVer: "0.1.7", channel: "ncmcli", model: `${system}_${arch()}_cli`, brand: "ncmcli", osVer: release(), clientIp: "127.0.0.1", deviceId: state.deviceId };
    const parameters: Record<string, string> = {
      appId: config.appId, signType: "RSA_SHA256", timestamp: String(Date.now()), device: JSON.stringify(device), bizContent: JSON.stringify(business),
    };
    if (token) parameters.accessToken = token;
    parameters.sign = signNeteaseParameters(parameters, config.privateKey);
    const url = new URL(path, "https://openapi.music.163.com");
    if (method === "GET") url.search = new URLSearchParams(parameters).toString();
    const operations: Record<string, NeteaseDiagnostic["operation"]> = {
      "/openapi/music/basic/oauth2/login/anonymous": "anonymous",
      "/openapi/music/basic/user/oauth2/qrcodekey/get/v2": "login_start",
      "/openapi/music/basic/oauth2/device/login/qrcode/get": "login_check",
      "/openapi/music/basic/user/profile/get/v2": "profile",
      "/openapi/v1/ncm/cli/manifest": "manifest",
      "/openapi/music/basic/search/song/get/v3": "search",
      "/openapi/music/basic/song/detail/get/v2": "track",
    };
    const operation = operations[path];
    if (!operation) throw new NeteaseTrialError("接口路径无效", "INVALID_API_PATH", 400);
    let httpStatus: number | null = null;
    let providerCode: string | null = null;
    try {
      const response = await fetch(url, {
        method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "eastherphil-music/1.0" },
        ...(method === "POST" ? { body: JSON.stringify(parameters) } : {}),
      });
      httpStatus = response.status;
      observeStatus?.(response.status);
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_500_000) { await reader.cancel(); throw new Error("response limit"); }
          chunks.push(value);
        }
      }
      let result: JsonObject;
      try { result = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { throw new Error("invalid response"); }
      const rawCode = String(result.code ?? "");
      providerCode = /^\d{1,6}$/.test(rawCode) ? rawCode : null;
      const manifestSuccess = path === "/openapi/v1/ncm/cli/manifest" && result.code === undefined && Object.keys(object(result.manifests)).length > 0;
      if (!response.ok || (String(result.code) !== "200" && !manifestSuccess)) {
        const details: NeteaseDiagnostic = { reference: randomUUID(), operation, httpStatus, providerCode, elapsedMs: Date.now() - started };
        console.warn(JSON.stringify({ event: "netease_upstream_failure", ...details }));
        throw new NeteaseTrialError("网易云接口暂时不可用", "UPSTREAM_ERROR", neteaseProviderErrorStatus(providerCode ?? "", response.status), details);
      }
      return result;
    } catch (error) {
      if (error instanceof NeteaseTrialError) throw error;
      const details: NeteaseDiagnostic = { reference: randomUUID(), operation, httpStatus, providerCode, elapsedMs: Date.now() - started };
      console.warn(JSON.stringify({ event: "netease_upstream_failure", ...details }));
      throw new NeteaseTrialError("连接网易云接口失败或超时，请稍后重试", "NETWORK_ERROR", 502, details);
    }
  }

  async function profile(config: NeteaseConfig, token: string) {
    const started = Date.now();
    let httpStatus: number | null = null;
    const result = await officialRequest("/openapi/music/basic/user/profile/get/v2", {}, config, token, "GET", status => { httpStatus = status; });
    if (result.data === null || typeof result.data !== "object" || Array.isArray(result.data)) {
      const details: NeteaseDiagnostic = { reference: randomUUID(), operation: "profile", httpStatus, providerCode: "200", elapsedMs: Date.now() - started };
      console.warn(JSON.stringify({ event: "netease_upstream_failure", ...details }));
      throw new NeteaseTrialError("网易云账号信息响应不完整，请稍后重试。", "MUSIC_PROFILE_INVALID", 502, details);
    }
  }

  async function authenticatedRequest(path: string, business: JsonObject, config: NeteaseConfig, token: string, method: "GET" | "POST" = "POST") {
    try { return await officialRequest(path, business, config, token, method); }
    catch (error) {
      if (!(error instanceof NeteaseTrialError) || error.status !== 401) throw error;
      try { await profile(config, token); }
      catch (probe) {
        if (!(probe instanceof NeteaseTrialError) || probe.status !== 401) throw probe;
        if (state.namedToken?.value !== token) {
          throw new NeteaseTrialError("音乐连接已更新，请重试。", "MUSIC_CONNECTION_CHANGED", 409, probe.details);
        }
        if (state.namedToken?.value === token) {
          state.namedToken = undefined;
          if (state.login?.status === "authorized") state.login = undefined;
          state.manifests = undefined;
          state.searchCache.clear();
          state.songRights?.clear();
        }
        throw new NeteaseTrialError("网易云授权已失效，请重新连接网易云音乐。", "MUSIC_LOGIN_REQUIRED", 401, probe.details);
      }
      throw new NeteaseTrialError("网易云账号已连接，但当前音乐应用无法访问此功能，请联系站点管理员核对接口权限。", "MUSIC_ACCESS_DENIED", 403, error.details);
    }
  }

  async function anonymousToken(config: NeteaseConfig) {
    if (state.token && state.token.until > Date.now()) return state.token.value;
    if (state.tokenPending) return state.tokenPending;
    state.tokenPending = (async () => {
      const response = await officialRequest("/openapi/music/basic/oauth2/login/anonymous", { clientId: config.appId }, config);
      const data = object(response.data);
      if (typeof data.accessToken !== "string" || !data.accessToken) throw new NeteaseTrialError("平台没有返回匿名授权结果", "ANONYMOUS_UNAVAILABLE");
      state.token = { value: data.accessToken, until: Date.now() + 10 * 60_000 };
      return data.accessToken;
    })();
    try { return await state.tokenPending; } finally { state.tokenPending = undefined; }
  }

  async function officialManifests(config: NeteaseConfig, token: string) {
    if (state.manifests) return state.manifests;
    if (state.manifestPending) return state.manifestPending;
    state.manifestPending = (async () => {
      const response = await authenticatedRequest("/openapi/v1/ncm/cli/manifest", { cliVersion: "0.1.7", cachedVersion: "{}" }, config, token);
      const manifests = object(response.manifests ?? object(response.data).manifests);
      if (!Object.keys(manifests).length) throw new NeteaseTrialError("平台尚未返回可用的搜索接口定义", "SEARCH_DEFINITION_UNAVAILABLE");
      if (state.namedToken?.value === token) state.manifests = manifests;
      return manifests;
    })();
    const pending = state.manifestPending;
    try { return await pending; } finally { if (state.manifestPending === pending) state.manifestPending = undefined; }
  }

  async function musicToken() {
    if (state.namedToken && state.namedToken.until > Date.now()) return state.namedToken.value;
    state.namedToken = undefined;
    state.searchCache.clear();
    state.songRights?.clear();
    throw new NeteaseTrialError("请先连接自己的网易云音乐账号。", "MUSIC_LOGIN_REQUIRED", 401);
  }

  async function startNeteaseLogin(config: NeteaseConfig) {
    const generation = ++state.loginGeneration;
    state.login = undefined;
    state.manifestPending = undefined;
    state.namedToken = undefined;
    state.manifests = undefined;
    state.searchCache.clear();
    state.songRights?.clear();
    const token = await anonymousToken(config);
    const result = await officialRequest("/openapi/music/basic/user/oauth2/qrcodekey/get/v2", { type: 2, expiredKey: "300" }, config, token, "GET");
    const data = object(result.data);
    if (typeof data.qrCodeUrl !== "string" || typeof data.uniKey !== "string") throw new NeteaseTrialError("平台未返回有效登录二维码", "LOGIN_UNAVAILABLE");
    const target = new URL(data.qrCodeUrl);
    // The signed official QR endpoint also returns its 163cn.tv short link.
    if (target.protocol !== "https:" || !["music.163.com", "st.music.163.com", "y.music.163.com", "163cn.tv"].includes(target.hostname) || target.username || target.password || target.port) {
      throw new NeteaseTrialError("平台返回的登录地址无法确认", "LOGIN_URL_REJECTED");
    }
    if (generation !== state.loginGeneration) throw new NeteaseTrialError("登录二维码已更新，请重试。", "LOGIN_REPLACED", 409);
    state.login = { key: data.uniKey, expiresAt: Date.now() + 300_000, checkedAt: 0, status: "waiting" };
    return { qrCodeDataUrl: await QRCode.toDataURL(target.href, { width: 256, margin: 2 }), expiresAt: state.login.expiresAt };
  }

  async function checkNeteaseLogin(config: NeteaseConfig) {
    const login = state.login;
    if (!login || login.expiresAt < Date.now()) return { status: "expired", message: "登录二维码已过期，请重新生成" };
    if (login.status === "authorized") return { status: "authorized", message: "网易云授权成功，可以搜索播放" };
    if (Date.now() - login.checkedAt < 4500) return { status: login.status, message: "请使用网易云音乐 App 扫码并确认" };
    login.checkedAt = Date.now();
    const token = await anonymousToken(config);
    const result = await officialRequest("/openapi/music/basic/oauth2/device/login/qrcode/get", { key: login.key, clientId: config.appId }, config, token, "GET");
    const data = object(result.data);
    if (state.login !== login || login.expiresAt <= Date.now()) return { status: "expired", message: "登录二维码已更新或过期" };
    if (Number(data.status) === 803) {
      const access = object(data.accessToken);
      const candidate = typeof access.accessToken === "string" ? access.accessToken.trim() : "";
      if (!candidate || /^(?:null|undefined)$/i.test(candidate)) throw new NeteaseTrialError("平台授权结果不完整，请重新登录", "LOGIN_TOKEN_MISSING");
      const expirySeconds = Number(access.expireTime);
      const ttlMs = Number.isFinite(expirySeconds) && expirySeconds > 0 ? Math.min(expirySeconds * 1000, 3_600_000) : 3_600_000;
      const tokenDeadline = Date.now() + ttlMs;
      try { await profile(config, candidate); }
      catch (error) {
        if (error instanceof NeteaseTrialError && (error.status === 401 || error.status === 403)) {
          throw new NeteaseTrialError("网易云未接受此账号对当前音乐应用的授权，请联系站点管理员核对应用授权范围。", "MUSIC_ACCOUNT_NOT_ALLOWED", 403, error.details);
        }
        throw error;
      }
      if (state.login !== login || login.expiresAt <= Date.now()) return { status: "expired", message: "登录二维码已更新或过期" };
      if (tokenDeadline <= Date.now()) throw new NeteaseTrialError("网易云授权已失效，请重新连接网易云音乐。", "MUSIC_LOGIN_REQUIRED", 401);
      state.namedToken = { value: candidate, until: tokenDeadline };
      state.manifests = undefined;
      state.searchCache.clear();
      login.status = "authorized";
      return { status: "authorized", message: "网易云授权成功，可以搜索播放" };
    }
    if (Number(data.status) === 800 || Number(data.status) === 804) {
      login.status = "expired";
      return { status: "expired", message: "登录二维码已失效，请重新生成" };
    }
    login.status = Number(data.status) === 802 ? "scanned" : "waiting";
    return { status: login.status, message: login.status === "scanned" ? "已扫码，请在网易云 App 中确认授权" : "请使用网易云音乐 App 扫码并确认" };
  }

  async function searchNeteaseSongs(query: string, config: NeteaseConfig): Promise<NeteaseSong[]> {
    query = query.trim();
    const token = await musicToken();
    const cached = state.searchCache.get(query);
    if (cached && cached.until > Date.now()) return cached.songs;
    const manifests = await officialManifests(config, token);
    const root = object(manifests.root);
    const resource = Array.isArray(root.sub_resources) ? root.sub_resources.map(object).find(item => item.name === "search") : undefined;
    const definition = resource && typeof resource.path === "string" ? object(manifests[resource.path]) : {};
    const method = Array.isArray(definition.methods) ? definition.methods.map(object).find(item => item.name === "song") : undefined;
    // A single read-only search endpoint, verified against the live official manifest.
    if (method?.path !== "/openapi/music/basic/search/song/get/v3" || method.http_method !== "GET") throw new NeteaseTrialError("平台搜索定义已变更，需要重新核对", "SEARCH_DEFINITION_CHANGED", 503);
    const response = await authenticatedRequest(method.path, { keyword: query, limit: 8, offset: 0, qualityFlag: false, trialScene: "cli" }, config, token, "GET");
    const data = object(response.data);
    const rows = Array.isArray(data.records) ? data.records : [];
    state.searchShape = { fields: Object.keys(response), dataFields: Object.keys(data), firstSongFields: Object.keys(object(rows[0])) };
    const rights = state.songRights ??= new Map();
    const songs: NeteaseSong[] = rows.slice(0, 8).flatMap(value => {
      const song = object(value);
      if (typeof song.id !== "string" || typeof song.name !== "string") return [];
      if (state.namedToken?.value === token) rights.set(song.id, { playFlag: song.playFlag, visible: song.visible, resConsumable: song.resConsumable, userConsumable: song.userConsumable, freeTrailFlag: song.freeTrailFlag, songFee: song.songFee });
      const artists = Array.isArray(song.artists) ? song.artists.map(object).map(artist => artist.name).filter(name => typeof name === "string").join(" / ") : "";
      const album = object(song.album);
      return [{ id: song.id, name: song.name.slice(0, 200), artists: artists.slice(0, 300), album: typeof album.name === "string" ? album.name.slice(0, 200) : "", coverUrl: safeNeteaseMediaUrl(album.picUrl ?? song.coverImgUrl), durationMs: typeof song.duration === "number" ? song.duration : undefined }];
    });
    while (rights.size > 160) rights.delete(rights.keys().next().value!);
    if (state.searchCache.size >= 20) state.searchCache.delete(state.searchCache.keys().next().value!);
    if (state.namedToken?.value === token) state.searchCache.set(query, { until: Date.now() + 60_000, songs });
    return songs;
  }

  async function getNeteaseTrack(songId: string, config: NeteaseConfig): Promise<NeteaseTrack> {
    const token = await musicToken();
    const response = await authenticatedRequest("/openapi/music/basic/song/detail/get/v2", { songId, withUrl: true, bitrate: 128 }, config, token, "GET");
    const data = object(response.data);
    const url = safeNeteaseMediaUrl(data.playUrl);
    let mediaSource: URL | undefined;
    try { if (typeof data.playUrl === "string") mediaSource = new URL(data.playUrl); } catch { /* diagnostics contain only parsed host/protocol */ }
    state.trackSummary = { fields: Object.keys(data), mediaHost: mediaSource?.hostname, mediaProtocol: mediaSource?.protocol, freeTrail: data.freeTrail, freeTrialPrivilege: data.freeTrialPrivilege, playFlag: data.playFlag };
    const rights = neteasePlaybackRights({ ...state.songRights?.get(songId), ...data });
    if (!url) throw new NeteaseTrialError("这首歌曲暂不可在当前应用或账号下播放", "NOT_PLAYABLE", 403);
    return {
      id: songId, url, name: typeof data.name === "string" ? data.name : undefined,
      artists: typeof data.artistName === "string" ? data.artistName : undefined,
      durationMs: typeof data.duration === "number" ? data.duration : undefined,
      ...rights,
    };
  }

  return { getStatus, reserveRequest, startNeteaseLogin, checkNeteaseLogin, searchNeteaseSongs, getNeteaseTrack };
}
