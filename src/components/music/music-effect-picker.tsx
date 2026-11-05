"use client";

import { useSiteMusic } from "./site-music";
import { isMusicEffectPreset, MUSIC_EFFECT_PRESETS } from "./music-effect-presets";
import styles from "./music-effect-picker.module.css";

export function MusicEffectPicker({ id, compact = false }: { id: string; compact?: boolean }) {
  const { effectPreset, selectEffect } = useSiteMusic();
  return <label className={`${styles.picker} ${compact ? styles.compact : ""}`} htmlFor={id}>
    <span>播放特效</span>
    <select id={id} value={effectPreset} onChange={event => {
      if (isMusicEffectPreset(event.target.value)) selectEffect(event.target.value);
    }}>
      {MUSIC_EFFECT_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
    </select>
  </label>;
}
