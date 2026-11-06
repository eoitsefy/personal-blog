"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { neteaseResourceUrl, validMusicSelection } from "@/lib/music/netease-embed";
import { parseMusicSearchSongs, type MusicSearchSong } from "@/lib/music/music-search";
import { useSiteMusic } from "./site-music";
import styles from "./music-embed.module.css";

class SearchMessage extends Error {}

export function MusicSearchPanel() {
  const { selectMusic } = useSiteMusic();
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<MusicSearchSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; request.current?.abort(); }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    request.current?.abort();
    const current = ++generation.current;
    if (!term || term.length > 80) { setSearching(false); setSearched(false); setSongs([]); setError("请输入 1 至 80 个字符的歌名或歌手。"); return; }
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    setSearching(true); setSearched(false); setError(""); setSongs([]);
    try {
      const response = await fetch("/api/music/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        cache: "no-store", body: JSON.stringify({ query: term }), signal: controller.signal,
      });
      if (!response.ok) {
        throw new SearchMessage(response.status === 429 ? "搜索请求较多，请稍后再试。" : response.status === 400 ? "请输入有效的歌名或歌手。" : response.status === 504 ? "搜索超时，请稍后重试。" : "搜索暂时不可用，请稍后重试，或粘贴完整链接。");
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result) || (result as { ok?: unknown }).ok !== true) throw new SearchMessage("搜索暂时不可用，请稍后重试。");
      const parsed = parseMusicSearchSongs((result as { songs?: unknown }).songs);
      if (!parsed) throw new SearchMessage("搜索结果暂时无法读取，请稍后重试。");
      if (current === generation.current && !controller.signal.aborted) { setSongs(parsed); setSearched(true); }
    } catch (caught) {
      if (current === generation.current && (!controller.signal.aborted || timedOut)) setError(timedOut ? "搜索超时，请稍后重试。" : caught instanceof SearchMessage ? caught.message : "搜索暂时不可用，请稍后重试，或粘贴完整链接。");
    } finally {
      clearTimeout(timer);
      if (current === generation.current) { request.current = null; setSearching(false); }
    }
  }

  return <section aria-labelledby="music-search-title" className={styles.searchSection}>
    <p className={styles.eyebrow}>FIND SOMETHING YOU LOVE</p><h2 id="music-search-title">寻找一首歌</h2>
    <form onSubmit={search} className={styles.form} role="search" aria-label="搜索音乐">
      <label htmlFor="music-search">搜索歌名或歌手</label>
      <div><input id="music-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入歌名或歌手" maxLength={80} autoComplete="off" /><button type="submit" aria-busy={searching}>{searching ? "重新搜索" : "搜索"}</button></div>
    </form>
    <p className={styles.resultStatus} role="status" aria-live="polite">{searching ? "正在搜索…" : searched ? songs.length ? `找到 ${songs.length} 首歌曲` : "没有找到歌曲，试试其他歌名或歌手。" : "选择歌曲后载入官方播放器，能否播放以网易云为准。"}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {songs.length > 0 && <ol className={styles.results}>{songs.map(song => {
      const item = validMusicSelection({ type: "song", id: song.id });
      if (!item) return null;
      return <li key={song.id}><div className={styles.resultInfo}><strong>{song.name}</strong><span>{song.artists || "未知歌手"}{song.album ? ` · ${song.album}` : ""}</span></div><div className={styles.resultActions}><a href={neteaseResourceUrl(item)} target="_blank" rel="noopener noreferrer" aria-label={`在网易云打开 ${song.name}`}>网易云 ↗</a><button type="button" onClick={() => selectMusic(item)} aria-label={`载入播放器：${song.name}`}>载入播放器</button></div></li>;
    })}</ol>}
  </section>;
}
