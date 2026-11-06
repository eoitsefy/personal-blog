import { neteaseResourceUrl, validMusicSelection } from "./netease-embed";

export type MusicSearchSong = { id: string; name: string; artists: string; album: string; url: string };
const controls = /[\p{Cc}\p{Cf}]/u;
export function normalizeMusicQuery(value: unknown): string | null {
  if (typeof value !== "string" || controls.test(value)) return null;
  const query = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return query && Array.from(query).length <= 80 && !controls.test(query) ? query : null;
}
function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function normalizeProviderSongs(value: unknown): MusicSearchSong[] | null {
  const root = object(value);
  if (!root || root.code !== 200) return null;
  const result = object(root.result);
  if (!result) return null;
  const rows = result.songs === undefined && result.songCount === 0 ? [] : result.songs;
  if (!Array.isArray(rows) || rows.length > 100) return null;
  const out: MusicSearchSong[] = [], seen = new Set<string>();
  for (const value of rows) {
    const row = object(value); if (!row) continue;
    const id = typeof row.id === "number" && Number.isSafeInteger(row.id) ? String(row.id) : typeof row.id === "string" ? row.id : "";
    const selection = validMusicSelection({ type: "song", id });
    const name = cleanText(row.name, 180), album = cleanText(object(row.album)?.name, 180);
    const artists = (Array.isArray(row.artists) ? row.artists : []).slice(0, 10).map(item => cleanText(object(item)?.name, 80)).filter(Boolean).join(" / ").slice(0, 240);
    if (!selection || !name || !artists || seen.has(id)) continue;
    seen.add(id); out.push({ id, name, artists, album, url: neteaseResourceUrl(selection) });
    if (out.length === 10) break;
  }
  return rows.length > 0 && out.length === 0 ? null : out;
}
// Reject malformed envelopes; invalid rows are filtered, deduplicated and never trusted for links.
export function parseMusicSearchSongs(value: unknown): MusicSearchSong[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const out: MusicSearchSong[] = [], seen = new Set<string>();
  for (const item of value) {
    const row = object(item); if (!row || typeof row.id !== "string") continue;
    const selection = validMusicSelection({ type: "song", id: row.id });
    const name = cleanText(row.name, 180), artists = cleanText(row.artists, 240), album = cleanText(row.album, 180);
    if (!selection || !name || !artists || row.url !== neteaseResourceUrl(selection) || seen.has(row.id)) continue;
    seen.add(row.id); out.push({ id: row.id, name, artists, album, url: neteaseResourceUrl(selection) });
  }
  return value.length > 0 && out.length === 0 ? null : out;
}
