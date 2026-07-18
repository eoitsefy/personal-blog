export function buildContentSecurityPolicy(isDevelopment: boolean) {
  return [
    "default-src 'self'",
    // AMap JS API 2.0 evaluates generated code while bootstrapping. Keep the
    // exception inside script-src and retain an explicit script origin list.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://webapi.amap.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' https:",
    "frame-src https://player.bilibili.com https://www.youtube-nocookie.com",
    `connect-src 'self' https://*.amap.com https://*.autonavi.com${isDevelopment ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

