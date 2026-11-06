"use client";
import { useState, type FormEvent } from "react";
import { parseNeteaseShare, neteaseResourceUrl } from "@/lib/music/netease-embed";
import { useSiteMusic } from "./site-music";
import { MusicAmbienceControls } from "./music-ambience-controls";
import { MusicSearchPanel } from "./music-search-panel";
import { MusicRecord } from "./music-record";
import styles from "./music-embed.module.css";

export function MusicPageContent() {
  const { selection, selectMusic, openPlayer, stopPlayer, effectPreset, ambienceEnabled, pageVisible } = useSiteMusic();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = parseNeteaseShare(input);
    if (!next) { setError("请粘贴网易云音乐的完整歌曲、歌单或专辑链接。短链接请先在网易云打开，再复制完整链接。"); return; }
    setError(""); selectMusic(next);
  }
  const names = { song: "歌曲", playlist: "歌单", album: "专辑" } as const;
  return <main className={styles.page} id="main-content">
    <header className={styles.header}><p className={styles.eyebrow}>E / ALONG THE WAY</p><h1>沿途留声</h1><p>让音乐，陪一段阅读时光。</p></header>
    <div className={styles.columns}>
      <section className={styles.library} aria-labelledby="music-search-title">
        <MusicSearchPanel />
        <details className={styles.pasteDetails}><summary id="music-select-title">粘贴网易云音乐链接</summary>
        <p>也可以复制歌曲、歌单或专辑的完整链接，粘贴在这里。</p>
        <form onSubmit={submit} className={styles.form}><label htmlFor="music-share">网易云音乐分享链接</label><div><input id="music-share" value={input} onChange={event => setInput(event.target.value)} placeholder="粘贴链接或分享文字" maxLength={4096} autoComplete="off" /><button type="submit">打开播放器</button></div></form>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.hint}>支持歌曲、歌单和专辑链接。163cn.tv 短链接请先打开并复制完整地址。</p></details>
        {selection && <div className={styles.current}><strong>已选择{names[selection.type]}</strong><div><button type="button" onClick={openPlayer}>展开播放器</button><button type="button" onClick={stopPlayer}>关闭并停止</button><a href={neteaseResourceUrl(selection)} target="_blank" rel="noopener noreferrer">在网易云打开 ↗</a></div></div>}
        <a className={styles.search} href="https://music.163.com/" target="_blank" rel="noopener noreferrer">前往网易云寻找音乐 ↗</a>
      </section>
      <aside className={styles.art} data-effect-preset={effectPreset} aria-label="沿途留声"><p>E / 沿途留声</p><div className={styles.record}><MusicRecord rotating={ambienceEnabled && pageVisible} /></div><h2>留一段旋律</h2><p>用网易云音乐官方播放器收听。</p><MusicAmbienceControls id="music-page-style" /></aside>
    </div>
    <p className={styles.note}>音乐由网易云音乐提供。若播放器无法加载或歌曲无法播放，可在网易云音乐打开；实际播放取决于平台和歌曲权限。</p>
  </main>;
}
