export type MusicResourceType = "song" | "playlist" | "album";
export type MusicSelection = { type: MusicResourceType; id: string };
const types = new Set<MusicResourceType>(["song", "playlist", "album"]);
const hosts = new Set(["music.163.com", "www.music.163.com", "m.music.163.com", "y.music.163.com"]);
const idPattern = /^[1-9]\d{0,19}$/;

export function validMusicSelection(value: unknown): MusicSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.type !== "string" || !types.has(item.type as MusicResourceType) || typeof item.id !== "string" || !idPattern.test(item.id)) return null;
  return { type: item.type as MusicResourceType, id: item.id };
}

export function parseStoredMusic(value: string | null): MusicSelection | null {
  if (!value || value.length > 200) return null;
  try { return validMusicSelection(JSON.parse(value)); } catch { return null; }
}

export function parseNeteaseShare(input: string): MusicSelection | null {
  if (input.length > 4096) return null;
  // Only complete URL tokens are considered, including ordinary copied share text.
  const matches = input.match(/(?<![a-zA-Z0-9_@.\/-])https?:\/\/[^\s<>"'，。！？）】]+/gi) ?? [];
  for (const raw of matches) {
    try {
      const authority = /^https?:\/\/([^/?#]+)/i.exec(raw)?.[1];
      if (!authority || authority.includes("@") || authority.includes(":")) continue;
      const url = new URL(raw);
      if (!hosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || !["http:", "https:"].includes(url.protocol)) continue;
      let path = url.pathname;
      let params = url.searchParams;
      if (url.hash.startsWith("#/")) {
        if (url.pathname !== "/" || url.search) continue;
        const hash = url.hash.slice(1);
        const question = hash.indexOf("?");
        if (question < 0) continue;
        path = hash.slice(0, question);
        params = new URLSearchParams(hash.slice(question + 1));
      } else if (url.hash) continue;
      const found = /^\/(?:m\/)?(song|playlist|album)\/?$/.exec(path);
      const ids = params.getAll("id");
      if (found && ids.length === 1 && idPattern.test(ids[0])) return { type: found[1] as MusicResourceType, id: ids[0] };
    } catch { /* Ignore invalid share text. */ }
  }
  return null;
}

export function neteaseEmbedUrl(selection: MusicSelection): string {
  const valid = validMusicSelection(selection);
  if (!valid) throw new Error("无效的音乐资源");
  const typesToNumber = { song: "2", playlist: "0", album: "1" } as const;
  const height = valid.type === "song" ? "66" : "430";
  return `https://music.163.com/outchain/player?type=${typesToNumber[valid.type]}&id=${valid.id}&auto=0&height=${height}`;
}

export function neteaseResourceUrl(selection: MusicSelection): string {
  const valid = validMusicSelection(selection);
  if (!valid) throw new Error("无效的音乐资源");
  return `https://music.163.com/#/${valid.type}?id=${valid.id}`;
}
