export const SITE_NAME = "EastherPhil 的沿途手记";
export const SITE_DESCRIPTION = "记录技术、阅读与日常生活的个人日志。";
export const SITE_AUTHOR = "EastherPhil";
export const SITE_URL = "https://eastherphil.cn";
export const SITE_OG_IMAGE = "/images/journal/night-courier.png";

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
