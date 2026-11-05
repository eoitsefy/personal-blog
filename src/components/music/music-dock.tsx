"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSiteMusic } from "./site-music";
import { MUSIC_SUGGESTIONS, formatTime } from "./use-netease-player";
import { MusicIcon } from "./music-icon";
import { MusicRecord } from "./music-record";
import { MusicProgress } from "./music-controls";
import { MusicEffectPicker } from "./music-effect-picker";
import { MUSIC_EFFECT_PRESETS } from "./music-effect-presets";
import styles from "./music-dock.module.css";

const noSubscribe = () => () => {};
const noPopover = () => false;
function readPopoverSupport() { return typeof HTMLElement.prototype.showPopover === "function"; }

export function MusicDock({ pathname }: { pathname: string }) {
  const { player: p, effectsEnabled, toggleEffects, pageVisible, effectPreset } = useSiteMusic();
  const effectName = MUSIC_EFFECT_PRESETS.find(preset => preset.id === effectPreset)?.label;
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const nativePopover = useSyncExternalStore(noSubscribe, readPopoverSupport, noPopover);
  const queue = p.songs.length ? p.songs : MUSIC_SUGGESTIONS;
  const selection = p.track?.name || p.selectedSong?.name;
  const selectedIndex = queue.findIndex(song => song.id === p.selectedSong?.id);
  const playable = p.ready && p.authenticated && p.loadingSongId === null;
  async function playPause() { if (p.track) await p.togglePlayback(); else await p.playSong(p.selectedSong || MUSIC_SUGGESTIONS[0]); }
  function next() { void p.playSong(queue[(selectedIndex + 1) % queue.length]); }
  function close() { if (nativePopover && panel.current?.matches(":popover-open")) panel.current.hidePopover(); setOpen(false); }
  useEffect(() => { if (nativePopover && panel.current?.matches(":popover-open")) panel.current.hidePopover(); }, [pathname, nativePopover]);
  useEffect(() => {
    if (nativePopover || !open) return;
    function outside(event: PointerEvent) { if (!panel.current?.contains(event.target as Node) && !launcher.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [nativePopover, open]);
  return <div className={styles.root} data-testid="site-music-dock">
    <button ref={launcher} className={`${styles.launcher} ${p.playing && !p.waiting && pageVisible ? styles.launcherPlaying : ""}`} popoverTarget={nativePopover ? "site-music-panel" : undefined} aria-controls="site-music-panel" aria-expanded={open} aria-label={selection ? `打开音乐播放器：${selection}` : "打开音乐播放器"} onClick={() => { if (!nativePopover) setOpen(value => !value); }}>
      <span className={styles.launcherRecord}><MusicRecord compact playing={p.playing && !p.waiting && pageVisible} /></span>
      <span className={styles.launcherCopy}><strong>{selection || "沿途留声"}</strong><small>{p.waiting ? "正在缓冲" : p.playing ? "正在播放" : "音乐"}</small></span><span className={styles.launcherBars} aria-hidden="true"><i /><i /><i /></span>
    </button>
    <div ref={panel} id="site-music-panel" popover={nativePopover ? "auto" : undefined} hidden={!nativePopover && !open} className={styles.panel} role="dialog" aria-label="沿途留声音乐播放器" onToggle={event => setOpen(event.newState === "open")}>
      <header className={styles.panelHeader}><div><span>E / ALONG THE WAY</span><h2>沿途留声</h2></div><div className={styles.headerButtons}><button className={`${styles.icon} ${effectsEnabled ? styles.effectsOn : ""}`} onClick={toggleEffects} aria-label={effectsEnabled ? "关闭播放特效" : "开启播放特效"} aria-pressed={effectsEnabled}><MusicIcon name="effects" /></button><button className={styles.icon} onClick={() => setQueueOpen(value => !value)} aria-label={queueOpen ? "收起待播列表" : "打开待播列表"} aria-expanded={queueOpen}><MusicIcon name="queue" /></button><button className={styles.icon} onClick={close} aria-label="收起音乐播放器"><MusicIcon name="close" /></button></div></header>
      <MusicEffectPicker id="dock-music-effect-preset" compact />
      <div className={styles.recordRow}><div className={styles.record}><MusicRecord compact playing={p.playing && !p.waiting && pageVisible} coverUrl={p.coverUrl} /></div><div className={styles.track}><h3>{selection || "让音乐，陪一段阅读时光。"}</h3><p>{p.track?.artists || p.selectedSong?.artists || "选一首喜欢的歌，慢慢读。"}</p><span>{p.loadingSongId ? "正在获取播放权限" : p.track ? p.track.preview ? "试听" : "完整播放" : "网易云音乐"}{p.track && ` · ${p.waiting ? "缓冲中" : p.playing ? "正在播放" : "已暂停"}`}</span></div></div>
      <MusicProgress id="dock-music-progress" />
      <div className={styles.controls}><Link href="/music" onClick={close}>搜索 / 登录</Link><div><button className={styles.play} onClick={() => void playPause()} disabled={!playable} aria-label={p.playing ? "暂停播放" : "开始播放"}><MusicIcon name={p.playing ? "pause" : "play"} /></button><button className={styles.icon} onClick={next} disabled={!playable} aria-label="下一首"><MusicIcon name="next" /></button></div><span>{effectsEnabled ? effectName : "特效已关闭"}</span></div>
      {p.track?.reason && <p className={styles.notice}>{p.track.reason}{p.activeBounds && ` ${formatTime(p.seekMinimum)}–${formatTime(p.seekMaximum)}`}</p>}
      {p.playError && <p className={styles.error} role="alert">{p.playError}</p>}
      {queueOpen && <div className={styles.queue}><div className={styles.queueHeading}>待播列表 <span>{queue.length} 首</span></div>{queue.map((song, index) => <button key={song.id} aria-label={`播放 ${song.name}`} aria-current={song.id === p.selectedSong?.id ? "true" : undefined} disabled={!playable} onClick={() => void p.playSong(song)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{song.name}</strong><small>{song.artists}</small></div><span>{formatTime((song.durationMs || 0) / 1000)}</span></button>)}</div>}
      <footer className={styles.panelFooter}>音乐由网易云音乐提供 · 播放范围以应用授权和账号权益为准</footer>
    </div>
  </div>;
}
