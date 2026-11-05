export type NeteaseSong = {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
};

export type NeteaseTrack = {
  id: string;
  name?: string;
  artists?: string;
  url: string;
  durationMs?: number;
  preview: boolean;
  previewStart?: number;
  previewEnd?: number;
  fullTrial?: boolean;
  reason?: string;
};

// Provider business errors can arrive with HTTP 200. Preserve their meaning
// instead of turning an account authorization failure into a proxy 502.
export function neteaseProviderErrorStatus(code: string, httpStatus: number) {
  if (code === "301" || code === "401" || httpStatus === 401) return 401;
  if (code === "403" || httpStatus === 403) return 403;
  if (code === "429" || httpStatus === 429) return 429;
  return 502;
}

export function neteasePlaybackRights(data: Record<string, unknown>) {
  if (data.visible === false) throw new NeteaseTrialError("这首歌曲受版权或地区限制，暂不可播放", "COPYRIGHT_RESTRICTED", 403);
  const segment = data.freeTrail;
  if (segment !== undefined && segment !== null && segment !== false) {
    const range = typeof segment === "object" ? segment as Record<string, unknown> : {};
    if (typeof range.start !== "number" || typeof range.end !== "number" || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) {
      throw new NeteaseTrialError("平台返回的试听片段范围不完整，暂不播放", "INVALID_PREVIEW_RANGE", 403);
    }
    return { preview: true, previewStart: range.start, previewEnd: range.end, reason: "平台提供片段试听" };
  }
  const privilege = data.freeTrialPrivilege !== null && typeof data.freeTrialPrivilege === "object" ? data.freeTrialPrivilege as Record<string, unknown> : {};
  if (privilege.resConsumable === true && privilege.userConsumable === true) return { preview: true, fullTrial: true, reason: "平台提供整首试听" };
  if (data.playFlag === false || data.freeTrailFlag === true) {
    const message = data.songFee === 1 ? "这首歌曲需要当前账号具备会员播放权益" : data.songFee === 4 ? "这首歌曲需要当前账号购买后播放" : "当前账号暂未获得这首歌曲的播放权限";
    throw new NeteaseTrialError(message, "PLAYBACK_RESTRICTED", 403);
  }
  // A valid signed detail response can grant a URL without repeating search flags.
  // The caller must still validate that URL before passing it to the browser.
  return { preview: false };
}

export function isLocalMusicTrial(request: Request, environment: string | undefined) {
  if (environment !== "development") return false;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  const origin = request.headers.get("origin");
  // Next may use localhost internally while the browser connects to 127.0.0.1.
  // Check the actual loopback Host, rather than the internal request hostname.
  if (origin && origin !== `${url.protocol}//${host}`) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

// Only provider-owned HTTPS media hosts may be returned to the audio element.
// The backend never fetches this URL and offers no general URL/proxy endpoint.
export function safeNeteaseMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && url.port !== "443")) return undefined;
    if (url.hostname !== "music.126.net" && !url.hostname.endsWith(".music.126.net")) return undefined;
    // The official API currently supplies HTTP CDN URLs. Only return their HTTPS
    // equivalent; the browser must never downgrade if that connection fails.
    url.protocol = "https:";
    return url.href;
  } catch {
    return undefined;
  }
}

export function safeMusicId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

export function cleanProviderMessage(value: unknown, secrets: readonly string[] = []) {
  let text = typeof value === "string" ? value : "网易云接口暂时不可用";
  for (const secret of secrets) {
    if (secret.length >= 8) text = text.split(secret).join("[已隐藏]");
  }
  return text.replace(/https?:\/\/\S+/gi, "[接口地址]")
    .replace(/(accessToken|refreshToken|appSecret|privateKey|sign)\s*[:=]\s*[^\s,;]+/gi, "$1=[已隐藏]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 220);
}

export type NeteaseDiagnostic = { reference: string; operation: "anonymous" | "login_start" | "login_check" | "profile" | "manifest" | "search" | "track"; httpStatus: number | null; providerCode: string | null; elapsedMs: number };

export class NeteaseTrialError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 502, public readonly details?: NeteaseDiagnostic) {
    super(message);
    this.name = "NeteaseTrialError";
  }
}
