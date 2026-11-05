"use client";
import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNeteasePlayer, type MusicPlayer } from "./use-netease-player";
import { MusicStarfield } from "./music-starfield";
import { MusicDock } from "./music-dock";
import { isMusicEffectPreset, type MusicEffectPreset } from "./music-effect-presets";

type MusicContext = { player: MusicPlayer; effectsEnabled: boolean; toggleEffects: () => void; effectPreset: MusicEffectPreset; selectEffect: (preset: MusicEffectPreset) => void; pageVisible: boolean };
const Context = createContext<MusicContext | null>(null);
const serverFalse = () => false;
const serverTrue = () => true;
let effectsFallback = true;
let presetFallback: MusicEffectPreset = "stars";
const serverPreset = () => "stars" as const;
function readEffects() { try { return localStorage.getItem("eastherphil.music.effects") !== "off"; } catch { return effectsFallback; } }
function readPreset(): MusicEffectPreset { try { const value = localStorage.getItem("eastherphil.music.effect-preset"); return isMusicEffectPreset(value) ? value : "stars"; } catch { return presetFallback; } }
function subscribeEffects(notify: () => void) { window.addEventListener("storage", notify); window.addEventListener("music-effects-preference", notify); return () => { window.removeEventListener("storage", notify); window.removeEventListener("music-effects-preference", notify); }; }
function subscribeVisibility(notify: () => void) { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); }
function readVisibility() { return document.visibilityState === "visible"; }
export function useSiteMusic() { const context = useContext(Context); if (!context) throw new Error("Music provider is required"); return context; }

export function SiteMusicHost({ children }: { children: ReactNode; sampleContent?: boolean }) {
  const pathname = usePathname();
  const enabled = pathname === "/" || pathname === "/posts" || pathname.startsWith("/posts/") || pathname === "/places" || pathname === "/assistant" || pathname === "/music";
  const audioRef = useRef<HTMLAudioElement>(null);
  const player = useNeteasePlayer(enabled, audioRef);
  const pageVisible = useSyncExternalStore(subscribeVisibility, readVisibility, serverFalse);
  const effectsEnabled = useSyncExternalStore(subscribeEffects, readEffects, serverTrue);
  const effectPreset = useSyncExternalStore(subscribeEffects, readPreset, serverPreset);
  function toggleEffects() { effectsFallback = !effectsEnabled; try { localStorage.setItem("eastherphil.music.effects", effectsFallback ? "on" : "off"); } catch {} window.dispatchEvent(new Event("music-effects-preference")); }
  function selectEffect(preset: MusicEffectPreset) { presetFallback = preset; try { localStorage.setItem("eastherphil.music.effect-preset", preset); } catch {} window.dispatchEvent(new Event("music-effects-preference")); }
  return <Context.Provider value={{ player, pageVisible, effectsEnabled, toggleEffects, effectPreset, selectEffect }}>
    {children}
    <audio ref={audioRef} {...player.audioProps} data-testid="site-music-audio" />
    {enabled && <><MusicStarfield active={player.playing && !player.waiting} enabled={effectsEnabled} preset={effectPreset} />{pathname !== "/music" && <MusicDock pathname={pathname} />}</>}
  </Context.Provider>;
}

export const LocalMusicHost = SiteMusicHost;
