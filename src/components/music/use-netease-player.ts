"use client";

import { useCallback, useEffect, useRef, useState, type AudioHTMLAttributes, type FormEvent, type RefObject } from "react";
export type Song = {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
};

type Track = {
  id: string;
  name?: string;
  artists?: string;
  url: string;
  durationMs?: number;
  preview: boolean;
  previewStart?: number;
  previewEnd?: number;
  fullTrial?: boolean;
  reason?: string;
};

type PreviewBounds = { start: number; end: number };

type Connection = {
  ready: boolean;
  signedIn: boolean;
  accountId: string | null;
  message: string;
  authenticated: boolean;
};

type LoginStatus = "idle" | "starting" | "waiting" | "scanned" | "authorized" | "expired" | "error" | "canceled";

type ApiResponse = {
  ok?: boolean;
  ready?: boolean;
  signedIn?: boolean;
  accountId?: string | null;
  code?: string;
  message?: string;
  authenticated?: boolean;
  songs?: Song[];
  track?: Track;
  login?: {
    qrCodeDataUrl?: string;
    expiresAt?: number;
    status?: "waiting" | "scanned" | "authorized" | "expired";
    message?: string;
  };
};

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function previewBounds(track: Track): PreviewBounds | null {
  if (!track.preview) return null;
  if (track.previewStart === undefined && track.previewEnd === undefined) return null;
  if (typeof track.previewStart !== "number" || typeof track.previewEnd !== "number"
    || !Number.isFinite(track.previewStart) || !Number.isFinite(track.previewEnd)
    || track.previewStart < 0 || track.previewEnd <= track.previewStart) {
    throw new Error("试听片段范围不完整，请重新选择歌曲。");
  }
  return { start: track.previewStart, end: track.previewEnd };
}

async function readMusicResponse(response: Response): Promise<ApiResponse> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error("音乐服务连接中断，请稍后重试。");
  }
  if (!text.trim()) throw new Error("音乐服务暂时返回空响应，请稍后重试。");
  try {
    const result: unknown = JSON.parse(text);
    if (result === null || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as ApiResponse;
  } catch {
    if (response.status >= 500) throw new Error(`音乐服务暂时无法响应（${response.status}），请稍后重试。`);
    if (response.status === 401) throw new Error("请先登录博客，再连接网易云音乐。");
    throw new Error("音乐服务返回格式异常，请稍后重试。");
  }
}

function safeImageUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function safeQrCode(value: unknown) {
  if (typeof value !== "string" || value.length > 2_000_000) return undefined;
  if (/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  if (/^data:image\/svg\+xml(?:;charset=[A-Za-z0-9-]+)?(?:;base64)?,/i.test(value)) return value;
  return undefined;
}

class MusicError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function requestMusic(body: { action: "search"; query: string } | { action: "play"; songId: string } | { action: "login-start" | "login-check" }, signal: AbortSignal) {
  const response = await fetch("/api/music", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await readMusicResponse(response);
  if (!response.ok || result.ok !== true) {
    throw new MusicError(result.message || "音乐服务暂时无法响应，请稍后重试。", result.code);
  }
  return result;
}

async function readConnection(signal: AbortSignal): Promise<Connection> {
  const request = new AbortController();
  const abort = () => request.abort();
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; request.abort(); }, 12_000);
  try {
    const response = await fetch("/api/music", {
      cache: "no-store", credentials: "same-origin", signal: request.signal,
    });
    const result = await readMusicResponse(response);
    if (!response.ok || result.ok !== true) throw new Error(result.message || "无法检查音乐服务连接。");
    return { ready: result.ready === true, signedIn: result.signedIn === true, accountId: typeof result.accountId === "string" ? result.accountId : null, message: result.message || "", authenticated: result.authenticated === true };
  } catch (error) {
    if (timedOut) throw new Error("连接检查超时，请点击重新检查。");
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function useNeteasePlayer(enabled: boolean, audioRef: RefObject<HTMLAudioElement | null>) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [checking, setChecking] = useState(true);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginQrCode, setLoginQrCode] = useState<string | null>(null);
  const [loginExpiresAt, setLoginExpiresAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [playError, setPlayError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const connectionRequest = useRef<AbortController | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const playRequest = useRef<AbortController | null>(null);
  const playbackGeneration = useRef(0);
  const previewBoundsRef = useRef<PreviewBounds | null>(null);
  const previewStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginRequest = useRef<AbortController | null>(null);
  const loginPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginGeneration = useRef(0);

  const stopLoginRequests = useCallback(() => {
    loginGeneration.current += 1;
    loginRequest.current?.abort();
    loginRequest.current = null;
    if (loginPollTimer.current !== null) clearTimeout(loginPollTimer.current);
    if (loginExpiryTimer.current !== null) clearTimeout(loginExpiryTimer.current);
    loginPollTimer.current = null;
    loginExpiryTimer.current = null;
  }, []);

  const lastIdentity = useRef<{ signedIn: boolean; accountId: string | null } | null>(null);
  const clearAccountMusic = useCallback(() => {
    searchRequest.current?.abort();
    playRequest.current?.abort();
    stopLoginRequests();
    playbackGeneration.current += 1;
    if (previewStopTimer.current !== null) clearTimeout(previewStopTimer.current);
    previewStopTimer.current = null;
    previewBoundsRef.current = null;
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
    setSongs([]); setSearched(false); setSearching(false); setSearchError(""); setQuery("");
    setSelectedSong(null); setTrack(null); setLoadingSongId(null); setPlayError("");
    setPlaying(false); setWaiting(false); setCurrentTime(0); setDuration(0); setSeekValue(null);
    setLoginStatus("idle"); setLoginMessage(""); setLoginQrCode(null); setLoginExpiresAt(null);
  }, [audioRef, stopLoginRequests]);

  const checkConnection = useCallback(async () => {
    connectionRequest.current?.abort();
    const controller = new AbortController();
    connectionRequest.current = controller;
    setChecking(true);
    setConnectionError("");
    try {
      const result = await readConnection(controller.signal);
      if (!controller.signal.aborted) {
        const previous = lastIdentity.current;
        if (previous && ((previous.signedIn && !result.signedIn) || (previous.accountId !== null && previous.accountId !== result.accountId))) clearAccountMusic();
        lastIdentity.current = { signedIn: result.signedIn, accountId: result.accountId };
        setConnection(result);
        if (!result.authenticated) setLoginStatus(status => status === "authorized" ? "idle" : status);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setConnection(null);
        setConnectionError(error instanceof Error ? error.message : "无法检查音乐服务连接。");
      }
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }, [clearAccountMusic]);

  const handleAuthError = useCallback((error: unknown) => {
    if (!(error instanceof MusicError) || !["LOGIN_REQUIRED", "MUSIC_LOGIN_REQUIRED"].includes(error.code || "")) return;
    connectionRequest.current?.abort();
    if (error.code === "LOGIN_REQUIRED") { clearAccountMusic(); lastIdentity.current = { signedIn: false, accountId: null }; }
    setChecking(false);
    setConnection(previous => previous ? { ...previous, signedIn: error.code === "LOGIN_REQUIRED" ? false : previous.signedIn, authenticated: false } : null);
    setLoginStatus("idle");
    setLoginMessage("");
  }, [clearAccountMusic]);

  function clearPreviewTimer() {
    if (previewStopTimer.current !== null) clearTimeout(previewStopTimer.current);
    previewStopTimer.current = null;
  }

  function audioPreviewBounds(audio: HTMLAudioElement) {
    const bounds = previewBoundsRef.current;
    if (!bounds) return null;
    return { start: bounds.start, end: Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(bounds.end, audio.duration) : bounds.end };
  }

  function finishPreview(audio: HTMLAudioElement) {
    clearPreviewTimer();
    audio.pause();
    const bounds = audioPreviewBounds(audio);
    if (bounds) {
      if (Math.abs(audio.currentTime - bounds.end) > 0.0001) audio.currentTime = bounds.end;
      setCurrentTime(bounds.end);
    }
    setPlaying(false);
    setWaiting(false);
  }

  function armPreviewTimer(audio: HTMLAudioElement) {
    clearPreviewTimer();
    const bounds = audioPreviewBounds(audio);
    if (!bounds || audio.paused || audio.seeking) return;
    if (audio.currentTime >= bounds.end) { finishPreview(audio); return; }
    const generation = playbackGeneration.current;
    const rate = audio.playbackRate > 0 ? audio.playbackRate : 1;
    const remainingMs = (bounds.end - audio.currentTime) * 1_000 / rate;
    previewStopTimer.current = setTimeout(() => {
      if (generation !== playbackGeneration.current || audio.paused) return;
      const currentBounds = audioPreviewBounds(audio);
      if (!currentBounds) return;
      if (audio.currentTime >= currentBounds.end - 0.025) finishPreview(audio);
      else armPreviewTimer(audio);
    }, Math.max(10, Math.min(remainingMs, 2_147_483_647)));
  }

  function metadataLoaded(audio: HTMLAudioElement) {
    const next = Number.isFinite(audio.duration) ? audio.duration : 0;
    setDuration(next);
    const bounds = audioPreviewBounds(audio);
    if (!bounds) return;
    if (next > 0 && bounds.start >= next) {
      clearPreviewTimer();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      previewBoundsRef.current = null;
      setTrack(null);
      setDuration(0);
      setPlayError("试听片段与音频时长不匹配，请重新选择歌曲。");
      return;
    }
    if (audio.currentTime < bounds.start || audio.currentTime >= bounds.end) audio.currentTime = bounds.start;
    setCurrentTime(audio.currentTime);
    armPreviewTimer(audio);
  }

  function updatePlaybackTime(audio: HTMLAudioElement) {
    const bounds = audioPreviewBounds(audio);
    if (bounds && audio.currentTime >= bounds.end) { finishPreview(audio); return; }
    if (bounds && audio.currentTime < bounds.start) audio.currentTime = bounds.start;
    setCurrentTime(audio.currentTime);
  }

  function enforceSeekBounds(audio: HTMLAudioElement) {
    clearPreviewTimer();
    const bounds = audioPreviewBounds(audio);
    if (!bounds) return;
    if (audio.currentTime < bounds.start) audio.currentTime = bounds.start;
    if (audio.currentTime >= bounds.end) finishPreview(audio);
  }

  const finishLogin = useCallback((status: "expired" | "error" | "canceled", message: string) => {
    stopLoginRequests();
    setLoginStatus(status);
    setLoginMessage(message);
    setLoginQrCode(null);
  }, [stopLoginRequests]);

  const startLogin = useCallback(async () => {
    if (!connection?.ready || !connection.signedIn) return;
    stopLoginRequests();
    const controller = new AbortController();
    loginRequest.current = controller;
    const generation = loginGeneration.current;
    const maximumDeadline = Date.now() + 5 * 60_000;
    setLoginStatus("starting");
    setLoginMessage("正在获取登录二维码…");
    setLoginQrCode(null);
    setLoginExpiresAt(null);
    const isCurrent = () => !controller.signal.aborted && generation === loginGeneration.current;
    const expire = () => {
      if (isCurrent()) finishLogin("expired", "二维码已过期。如需登录，请重新获取二维码。");
    };
    loginExpiryTimer.current = setTimeout(expire, maximumDeadline - Date.now());
    try {
      const result = await requestMusic({ action: "login-start" }, controller.signal);
      if (!isCurrent()) return;
      const qrCode = safeQrCode(result.login?.qrCodeDataUrl);
      const expiresAt = result.login?.expiresAt;
      if (!qrCode || typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) throw new Error("登录二维码信息不完整，请稍后重试。");
      const deadline = Math.min(expiresAt, maximumDeadline);
      if (deadline <= Date.now()) { expire(); return; }
      setLoginQrCode(qrCode);
      setLoginExpiresAt(deadline);
      setLoginStatus("waiting");
      setLoginMessage("请使用网易云音乐 App 扫码，并在手机上确认登录。");
      if (loginExpiryTimer.current !== null) clearTimeout(loginExpiryTimer.current);
      loginExpiryTimer.current = setTimeout(expire, deadline - Date.now());

      async function pollLogin() {
        if (!isCurrent()) return;
        if (Date.now() >= deadline) { expire(); return; }
        try {
          const checked = await requestMusic({ action: "login-check" }, controller.signal);
          if (!isCurrent()) return;
          if (Date.now() >= deadline) { expire(); return; }
          const status = checked.login?.status;
          if (status === "authorized") {
            stopLoginRequests();
            setLoginQrCode(null);
            setLoginStatus("idle");
            setLoginMessage("");
            setSearchError("");
            await checkConnection();
            return;
          }
          if (status === "expired") { expire(); return; }
          if (status !== "waiting" && status !== "scanned") throw new Error("无法确认登录状态，请重新登录。");
          setLoginStatus(status);
          setLoginMessage(checked.login?.message || (status === "scanned" ? "已扫码，请在网易云音乐 App 中确认登录。" : "等待扫码，请使用网易云音乐 App 扫描二维码。"));
          loginPollTimer.current = setTimeout(() => void pollLogin(), 5_000);
        } catch (error) {
          if (isCurrent()) { handleAuthError(error); finishLogin("error", error instanceof Error ? error.message : "登录状态检查失败，请重新登录。"); }
        }
      }

      loginPollTimer.current = setTimeout(() => void pollLogin(), 5_000);
    } catch (error) {
      if (isCurrent()) { handleAuthError(error); finishLogin("error", error instanceof Error ? error.message : "无法获取登录二维码，请稍后重试。"); }
    }
  }, [checkConnection, finishLogin, stopLoginRequests, handleAuthError, connection]);

  useEffect(() => {
    if (!enabled) return;
    const initialCheck = setTimeout(() => void checkConnection(), 0);
    const refresh = () => { if (document.visibilityState === "visible") void checkConnection(); };
    document.addEventListener("visibilitychange", refresh);
    const audio = audioRef.current;
    if (audio) audio.volume = 0.7;
    return () => {
      clearTimeout(initialCheck);
      document.removeEventListener("visibilitychange", refresh);
      connectionRequest.current?.abort();
      searchRequest.current?.abort();
      playRequest.current?.abort();
      stopLoginRequests();
      setLoginStatus("idle");
      setLoginMessage("");
      setLoginQrCode(null);
      setSearching(false);
      setLoadingSongId(null);
      setTrack(null);
      playbackGeneration.current += 1;
      clearPreviewTimer();
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, [enabled, stopLoginRequests, audioRef, checkConnection]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized || !connection?.ready || !connection.signedIn || !connection.authenticated) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setSearchError("");
    setSearched(true);
    setSongs([]);
    try {
      const result = await requestMusic({ action: "search", query: normalized }, controller.signal);
      if (!controller.signal.aborted) {
        if (!Array.isArray(result.songs)) throw new Error("搜索结果格式不完整，请重试。");
        setSongs(result.songs.filter(song => typeof song.id === "string" && typeof song.name === "string"));
      }
    } catch (error) {
      if (!controller.signal.aborted) { handleAuthError(error); setSearchError(error instanceof Error ? error.message : "搜索失败，请重试。"); }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function playSong(song: Song) {
    const audio = audioRef.current;
    if (!audio || !connection?.ready || !connection.signedIn || !connection.authenticated) return;
    playRequest.current?.abort();
    const controller = new AbortController();
    playRequest.current = controller;
    const generation = ++playbackGeneration.current;
    clearPreviewTimer();
    previewBoundsRef.current = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setPlaying(false);
    setWaiting(false);
    setCurrentTime(0);
    setDuration(0);
    setSeekValue(null);
    setTrack(null);
    setSelectedSong(song);
    setPlayError("");
    setLoadingSongId(song.id);
    try {
      const result = await requestMusic({ action: "play", songId: song.id }, controller.signal);
      if (controller.signal.aborted || generation !== playbackGeneration.current) return;
      const next = result.track;
      if (!next?.url || next.id !== song.id || typeof next.preview !== "boolean") throw new Error("播放信息不完整，请重新选择歌曲。");
      const url = new URL(next.url);
      if (url.protocol !== "https:") throw new Error("音乐服务没有返回安全的播放地址。");
      previewBoundsRef.current = previewBounds(next);
      setTrack(next);
      audio.src = url.href;
      audio.load();
      if (previewBoundsRef.current) audio.currentTime = previewBoundsRef.current.start;
      try {
        await audio.play();
      } catch (error) {
        if (controller.signal.aborted || generation !== playbackGeneration.current) return;
        setWaiting(false);
        setPlayError(error instanceof DOMException && error.name === "NotAllowedError"
          ? "歌曲已准备好，请点击下方播放按钮。"
          : "音频暂时无法播放，请重试；播放地址可能已失效或受到权限限制。");
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === playbackGeneration.current) {
        handleAuthError(error);
        setPlayError(error instanceof Error ? error.message : "无法获取这首歌曲的播放权限。");
      }
    } finally {
      if (!controller.signal.aborted && generation === playbackGeneration.current) setLoadingSongId(null);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !track || !connection?.signedIn || !connection.authenticated) return;
    if (!audio.getAttribute("src") && selectedSong) { await playSong(selectedSong); return; }
    if (!audio.paused) {
      audio.pause();
      return;
    }
    const generation = playbackGeneration.current;
    setPlayError("");
    const bounds = audioPreviewBounds(audio);
    if (bounds && (audio.currentTime < bounds.start || audio.currentTime >= bounds.end)) audio.currentTime = bounds.start;
    try {
      await audio.play();
    } catch {
      if (generation === playbackGeneration.current) setPlayError("无法继续播放，请在搜索结果中重新选择这首歌。");
    }
  }

  function commitSeek(value: number) {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) {
      const bounds = audioPreviewBounds(audio);
      audio.currentTime = Math.max(bounds?.start ?? 0, Math.min(value, bounds?.end ?? audio.duration));
      setCurrentTime(audio.currentTime);
      if (bounds && audio.currentTime >= bounds.end) finishPreview(audio);
      else armPreviewTimer(audio);
    }
    setSeekValue(null);
  }

  const coverUrl = safeImageUrl(selectedSong?.coverUrl);
  const activeBounds = track?.preview && typeof track.previewStart === "number" && typeof track.previewEnd === "number"
    ? { start: track.previewStart, end: track.previewEnd } : null;
  const seekMinimum = activeBounds?.start ?? 0;
  const seekMaximum = activeBounds ? Math.min(activeBounds.end, duration || activeBounds.end) : duration;
  const displayedTime = Math.max(seekMinimum, Math.min(seekValue ?? currentTime, seekMaximum));
  const canSeek = track !== null && duration > 0 && Number.isFinite(duration);
  const ready = connection?.ready === true;
  const loginInProgress = ["starting", "waiting", "scanned"].includes(loginStatus);
  const signedIn = connection?.signedIn === true;
  const authenticated = signedIn && connection?.authenticated === true;


  const audioProps: AudioHTMLAttributes<HTMLAudioElement> = {
    preload: "none",
    onPlay: event => { if (!enabled) { event.currentTarget.pause(); return; } setPlaying(true); setPlayError(""); armPreviewTimer(event.currentTarget); },
    onPause: () => { clearPreviewTimer(); setPlaying(false); setWaiting(false); },
    onWaiting: () => { clearPreviewTimer(); setWaiting(true); },
    onPlaying: event => { setWaiting(false); armPreviewTimer(event.currentTarget); },
    onCanPlay: () => setWaiting(false),
    onLoadedMetadata: event => metadataLoaded(event.currentTarget),
    onDurationChange: event => metadataLoaded(event.currentTarget),
    onTimeUpdate: event => updatePlaybackTime(event.currentTarget),
    onSeeking: event => enforceSeekBounds(event.currentTarget),
    onSeeked: event => { updatePlaybackTime(event.currentTarget); armPreviewTimer(event.currentTarget); },
    onRateChange: event => armPreviewTimer(event.currentTarget),
    onEnded: () => { clearPreviewTimer(); setPlaying(false); setWaiting(false); },
    onError: () => { if (audioRef.current?.getAttribute("src")) { clearPreviewTimer(); setPlaying(false); setWaiting(false); setPlayError("音频加载失败，可能是网络、播放地址或歌曲权限发生变化。请重新选择歌曲。"); } },
  };
  function changeVolume(value: number) {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  }
  return {
    connection, connectionError, checking, checkConnection, ready, signedIn, authenticated,
    loginStatus, loginInProgress, loginMessage, loginQrCode, loginExpiresAt, startLogin,
    cancelLogin: () => finishLogin("canceled", "已取消登录。"),
    query, setQuery, songs, searched, searching, searchError, search,
    track, selectedSong, loadingSongId, playing, waiting, playError, currentTime, duration,
    volume, changeVolume, seekValue, setSeekValue, commitSeek, canSeek, seekMinimum, seekMaximum, displayedTime,
    togglePlayback, playSong, coverUrl, activeBounds, audioProps,
  };
}
export type MusicPlayer = ReturnType<typeof useNeteasePlayer>;
export const MUSIC_SUGGESTIONS: Song[] = [
  { id: "5666744E6F69F55B5ADF718ECD29F84E", name: "Breaktime", artists: "Kevin MacLeod", album: "Silent Film:Light Collection", durationMs: 126000 },
  { id: "5AE9EFF904A99E6B9E8B7D7892941D69", name: "Promising Relationship", artists: "Kevin MacLeod", album: "Sadness", durationMs: 108000 },
];
