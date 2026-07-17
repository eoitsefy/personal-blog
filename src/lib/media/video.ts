export type TrustedVideo = {
  provider: "BILIBILI" | "YOUTUBE";
  videoId: string;
  sourceUrl: string;
  embedUrl: string;
};

export type VideoDirective = {
  title: string;
  url: string;
};

const VIDEO_DIRECTIVE = /\[video:([^\]\r\n]{1,160})\]\(([^)\s]{1,2048})\)/gi;

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function parseBilibili(url: URL): TrustedVideo | null {
  if (url.hostname !== "www.bilibili.com" && url.hostname !== "bilibili.com") return null;
  const match = url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10}|av([1-9][0-9]*))\/?$/i);
  if (!match) return null;

  const rawId = match[1] ?? "";
  const isBvid = rawId.toUpperCase().startsWith("BV");
  const videoId = isBvid ? `BV${rawId.slice(2)}` : rawId.toLowerCase();
  const pageValue = url.searchParams.get("p") ?? "1";
  if (!/^[1-9][0-9]{0,2}$/.test(pageValue)) return null;

  const sourceUrl = new URL(`/video/${videoId}`, "https://www.bilibili.com");
  if (pageValue !== "1") sourceUrl.searchParams.set("p", pageValue);
  const embed = new URL("https://player.bilibili.com/player.html");
  embed.searchParams.set(isBvid ? "bvid" : "aid", isBvid ? videoId : match[2] ?? "");
  embed.searchParams.set("page", pageValue);
  embed.searchParams.set("high_quality", "1");
  embed.searchParams.set("danmaku", "0");
  embed.searchParams.set("autoplay", "0");

  return { provider: "BILIBILI", videoId, sourceUrl: sourceUrl.toString(), embedUrl: embed.toString() };
}

function parseYouTube(url: URL): TrustedVideo | null {
  let videoId = "";
  if (url.hostname === "youtu.be") {
    videoId = url.pathname.slice(1);
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
    else videoId = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? "";
  } else {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
  return { provider: "YOUTUBE", videoId, sourceUrl, embedUrl };
}

export function parseTrustedVideoUrl(value: string): TrustedVideo | null {
  const url = safeUrl(value.trim());
  if (!url) return null;
  return parseBilibili(url) ?? parseYouTube(url);
}

export function extractVideoDirectives(markdown: string): VideoDirective[] {
  return [...markdown.matchAll(new RegExp(VIDEO_DIRECTIVE.source, VIDEO_DIRECTIVE.flags))].map((match) => ({
    title: (match[1] ?? "").trim(),
    url: match[2] ?? "",
  }));
}
