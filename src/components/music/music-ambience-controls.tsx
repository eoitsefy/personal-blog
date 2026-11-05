"use client";
import { isMusicEffectPreset, MUSIC_EFFECT_PRESETS } from "./music-effect-presets";
import { useSiteMusic } from "./site-music";
import styles from "./music-embed.module.css";

export function MusicAmbienceControls({ id }: { id: string }) {
  const { effectPreset, selectEffect, ambienceEnabled, toggleAmbience } = useSiteMusic();
  return <div className={styles.ambienceControls}>
    <label htmlFor={id}>外观风格</label>
    <select id={id} value={effectPreset} onChange={event => { if (isMusicEffectPreset(event.target.value)) selectEffect(event.target.value); }}>
      {MUSIC_EFFECT_PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    <button type="button" aria-pressed={ambienceEnabled} onClick={toggleAmbience}>{ambienceEnabled ? "关闭氛围动效" : "开启氛围动效"}</button>
    <span>装饰动效，可独立开关</span>
  </div>;
}
