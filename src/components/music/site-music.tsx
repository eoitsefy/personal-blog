"use client";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { neteaseEmbedUrl, neteaseResourceUrl, parseStoredMusic, validMusicSelection, type MusicSelection } from "@/lib/music/netease-embed";
import { isMusicEffectPreset, type MusicEffectPreset } from "./music-effect-presets";
import { MusicStarfield } from "./music-starfield";
import { MusicAmbienceControls } from "./music-ambience-controls";
import styles from "./music-embed.module.css";

const storageKey = "eastherphil.music.selection.v1";
let memorySelection = "";
let memoryOverride = false;
function readSelection() { if (memoryOverride) return memorySelection; try { return localStorage.getItem(storageKey) ?? ""; } catch { return memorySelection; } }
function subscribeSelection(notify: () => void) { window.addEventListener("storage", notify); window.addEventListener("music-selection-change", notify); return () => { window.removeEventListener("storage", notify); window.removeEventListener("music-selection-change", notify); }; }
function saveSelection(selection: MusicSelection | null) {
  const validated = selection ? validMusicSelection(selection) : null;
  const value = validated ? JSON.stringify(validated) : "";
  memorySelection = value;
  try { if (value) localStorage.setItem(storageKey, value); else localStorage.removeItem(storageKey); memoryOverride = false; } catch { memoryOverride = true; }
  window.dispatchEvent(new Event("music-selection-change"));
}
const presetKey = "eastherphil.music.effect-preset";
const ambienceKey = "eastherphil.music.ambience.v1";
let presetFallback: MusicEffectPreset = "stars";
let ambienceFallback = false;
let preferenceMemoryOnly = false;
function readPreset(): MusicEffectPreset {
  if (preferenceMemoryOnly) return presetFallback;
  try { const value = localStorage.getItem(presetKey); return isMusicEffectPreset(value) ? value : "stars"; } catch { return presetFallback; }
}
function readAmbience() {
  if (preferenceMemoryOnly) return ambienceFallback;
  try { return localStorage.getItem(ambienceKey) === "on"; } catch { return ambienceFallback; }
}
function subscribePreference(notify: () => void) { window.addEventListener("storage", notify); window.addEventListener("music-ambience-change", notify); return () => { window.removeEventListener("storage", notify); window.removeEventListener("music-ambience-change", notify); }; }
function savePreferences(preset: MusicEffectPreset, enabled: boolean) {
  presetFallback = preset; ambienceFallback = enabled;
  try { localStorage.setItem(presetKey, preset); localStorage.setItem(ambienceKey, enabled ? "on" : "off"); preferenceMemoryOnly = false; } catch { preferenceMemoryOnly = true; }
  window.dispatchEvent(new Event("music-ambience-change"));
}
function subscribeVisibility(notify: () => void) { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); }
function readVisibility() { return document.visibilityState === "visible"; }
type MusicContext = { pageVisible: boolean; selection: MusicSelection | null; selectMusic: (selection: MusicSelection) => void; openPlayer: () => void; stopPlayer: () => void; effectPreset: MusicEffectPreset; selectEffect: (preset: MusicEffectPreset) => void; ambienceEnabled: boolean; toggleAmbience: () => void };
const Context = createContext<MusicContext | null>(null);
export function useSiteMusic() { const context = useContext(Context); if (!context) throw new Error("Music provider is required"); return context; }

export function SiteMusicHost({ children }: { children: ReactNode; sampleContent?: boolean }) {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribeSelection, readSelection, () => "");
  const selection = parseStoredMusic(raw);
  const [open, setOpen] = useState(false);
  const pageVisible = useSyncExternalStore(subscribeVisibility, readVisibility, () => false);
  const effectPreset = useSyncExternalStore(subscribePreference, readPreset, () => "stars" as const);
  const ambienceEnabled = useSyncExternalStore(subscribePreference, readAmbience, () => false);
  const enabled = pathname === "/" || pathname === "/posts" || pathname.startsWith("/posts/") || pathname === "/places" || pathname === "/assistant" || pathname === "/music";
  function selectMusic(value: MusicSelection) { if (!validMusicSelection(value)) return; saveSelection(value); setOpen(true); }
  function stopPlayer() { saveSelection(null); savePreferences(effectPreset, false); setOpen(false); }
  function selectEffect(preset: MusicEffectPreset) { if (isMusicEffectPreset(preset)) savePreferences(preset, ambienceEnabled); }
  function toggleAmbience() { savePreferences(effectPreset, !ambienceEnabled); }
  return <Context.Provider value={{ selection, selectMusic, openPlayer: () => setOpen(true), stopPlayer, effectPreset, selectEffect, ambienceEnabled, toggleAmbience, pageVisible }}>
    {children}
    <MusicStarfield enabled={enabled && ambienceEnabled} preset={effectPreset} />
    {(selection || ambienceEnabled) && <div className={styles.dock} data-effect-preset={effectPreset} data-testid="site-music-dock" hidden={!enabled}>
      <button type="button" className={styles.launcher} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="site-music-panel">{open ? "收起播放器" : "♫ 沿途留声"}</button>
      <section id="site-music-panel" className={styles.panel} hidden={!open} aria-label={selection ? "网易云音乐播放器" : "沿途留声氛围设置"}>
        <div className={styles.panelHead}><div><span>E / ALONG THE WAY</span><strong>沿途留声</strong></div><div className={styles.actions}><button type="button" onClick={() => setOpen(false)}>收起</button><button type="button" onClick={stopPlayer}>关闭并停止</button></div></div>
        <MusicAmbienceControls id="music-dock-style" />
        {selection ? <><iframe title="网易云音乐官方播放器" src={neteaseEmbedUrl(selection)} className={styles.frame} style={{ height: selection.type === "song" ? 86 : 450 }} sandbox="allow-scripts allow-same-origin allow-popups" allow="autoplay" referrerPolicy="no-referrer" />
        <p className={styles.footnote}>如无法播放，请<a href={neteaseResourceUrl(selection)} target="_blank" rel="noopener noreferrer">在网易云打开</a>。播放与版权限制以网易云为准。</p></> : <p className={styles.footnote}>尚未选择音乐，<Link href="/music" onClick={() => setOpen(false)}>前往沿途留声选歌</Link>。</p>}
      </section>
    </div>}
  </Context.Provider>;
}
export const LocalMusicHost = SiteMusicHost;
