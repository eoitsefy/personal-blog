"use client";
import { useSiteMusic } from "./site-music";
import { formatTime } from "./use-netease-player";
import styles from "./music-dock.module.css";

export function MusicProgress({ id }: { id: string }) {
  const p = useSiteMusic().player;
  return <div className={styles.progress}>
    <label className={styles.srOnly} htmlFor={id}>播放进度</label>
    <input id={id} type="range" min={p.seekMinimum} max={p.seekMaximum || 0} step={0.1} value={p.displayedTime} disabled={!p.canSeek} aria-valuetext={`${formatTime(p.displayedTime)}，共 ${formatTime(p.seekMaximum)}`}
      onChange={event => p.setSeekValue(Number(event.target.value))}
      onPointerUp={event => { p.commitSeek(Number(event.currentTarget.value)); setTimeout(() => p.setSeekValue(null), 0); }}
      onPointerCancel={() => p.setSeekValue(null)}
      onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) p.commitSeek(Number(event.currentTarget.value)); }}
      onBlur={() => p.setSeekValue(null)} />
    <div><span>{formatTime(p.displayedTime)}</span><span>{formatTime(p.seekMaximum)}</span></div>
  </div>;
}
