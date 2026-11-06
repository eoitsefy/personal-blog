import "server-only";
import { createHash } from "node:crypto";
import { normalizeProviderSongs, type MusicSearchSong } from "./music-search";

type SearchFailure = "RATE_LIMITED" | "BUSY" | "TIMEOUT" | "UPSTREAM";
export class MusicSearchError extends Error {
  constructor(public readonly reason: SearchFailure) { super(reason); }
}
type Options = { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; cacheMax?: number; inflightMax?: number };
const hash = (input: string) => createHash("sha256").update(input).digest("hex");
export function createMusicSearchService(options: Options = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  const cacheMax = options.cacheMax ?? 200, inflightMax = options.inflightMax ?? 4, timeoutMs = options.timeoutMs ?? 8000;
  const cache = new Map<string, { songs: MusicSearchSong[]; until: number }>();
  const inflight = new Map<string, Promise<MusicSearchSong[]>>();
  const sources = new Map<string, { start: number; count: number }>();
  let globalWindow: number | null = null, globalCount = 0;
  function admit(source: string) {
    const key = hash(source), t = now();
    for (const [k, v] of sources) if (t - v.start >= 60_000) sources.delete(k);
    let entry = sources.get(key);
    if (!entry) { if (sources.size >= 1000) throw new MusicSearchError("BUSY"); entry = { start: t, count: 0 }; sources.set(key, entry); }
    if (entry.count >= 30) throw new MusicSearchError("RATE_LIMITED");
    entry.count++;
  }
  async function upstream(query: string): Promise<MusicSearchSong[]> {
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const url = new URL("https://music.163.com/api/search/get");
      url.search = new URLSearchParams({ s: query, type: "1", limit: "10", offset: "0" }).toString();
      const response = await fetcher(url, { method: "GET", redirect: "error", signal: controller.signal, cache: "no-store", credentials: "omit" });
      if (!response.ok || !response.body) throw new MusicSearchError("UPSTREAM");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 512 * 1024) { await reader.cancel(); throw new MusicSearchError("UPSTREAM"); } chunks.push(next.value); } } finally { reader.releaseLock(); }
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MusicSearchError("UPSTREAM"); }
      const songs = normalizeProviderSongs(parsed); if (!songs) throw new MusicSearchError("UPSTREAM");
      return songs;
    } catch (error) {
      if (timedOut) throw new MusicSearchError("TIMEOUT");
      if (error instanceof MusicSearchError) throw error;
      throw new MusicSearchError("UPSTREAM");
    } finally { clearTimeout(timer); }
  }
  async function search(query: string, source: string): Promise<MusicSearchSong[]> {
    admit(source); const key = hash(query), t = now(); const hit = cache.get(key);
    if (hit && hit.until > t) { cache.delete(key); cache.set(key, hit); return hit.songs; }
    if (hit) cache.delete(key);
    const pending = inflight.get(key); if (pending) return pending;
    if (inflight.size >= inflightMax) throw new MusicSearchError("BUSY");
    if (globalWindow === null || t - globalWindow >= 60_000) { globalWindow = t; globalCount = 0; }
    if (globalCount >= 60) throw new MusicSearchError("RATE_LIMITED");
    globalCount++;
    const work = upstream(query).then(songs => {
      if (cache.size >= cacheMax) cache.delete(cache.keys().next().value!);
      cache.set(key, { songs, until: now() + (songs.length ? 300_000 : 30_000) }); return songs;
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, work); return work;
  }
  return { search };
}
export const musicSearchService = createMusicSearchService();
