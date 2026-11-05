"use client";
import Image from "next/image";
import Link from "next/link";
import { useSiteMusic } from "./site-music";
import { formatTime, MUSIC_SUGGESTIONS } from "./use-netease-player";
import { MusicRecord } from "./music-record";
import { MusicIcon } from "./music-icon";
import { MusicEffectPicker } from "./music-effect-picker";
import styles from "./netease-trial.module.css";
function MusicMark({ small = false }: { small?: boolean }) {
  return <svg width={small ? 22 : 52} height={small ? 22 : 52} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M20 34V13l19-4v21M20 19l19-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="13.5" cy="35" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="2.5" />
    <ellipse cx="32.5" cy="31" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="2.5" />
  </svg>;
}


export function NeteaseTrial() {
  const music = useSiteMusic();
  const {
    connection, connectionError, checking, checkConnection, ready, signedIn, authenticated,
    loginInProgress, loginStatus, loginMessage, loginQrCode, loginExpiresAt, startLogin, cancelLogin,
    query, setQuery, songs, searched, searching, searchError, search,
    track, selectedSong, loadingSongId, playing, waiting, playError, currentTime, volume, changeVolume,
    setSeekValue, commitSeek, canSeek, seekMinimum, seekMaximum, displayedTime,
    togglePlayback, playSong, coverUrl, activeBounds,
  } = music.player;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>E / ALONG THE WAY</p><h1>沿途留声</h1><p className={styles.intro}>让音乐，陪一段阅读时光。</p></div>
      <div className={styles.headerActions}><button className={styles.effectButton} onClick={music.toggleEffects} aria-pressed={music.effectsEnabled}><MusicIcon name="effects" />{music.effectsEnabled ? "动态特效开启" : "动态特效关闭"}</button><MusicEffectPicker id="music-effect-preset" /><Link href="/posts">带着音乐，继续阅读 ↗</Link></div>
    </header>

    <section className={styles.connection} aria-label="音乐服务连接">
      <span className={`${styles.statusDot} ${ready ? styles.statusReady : ""}`} aria-hidden="true" />
      <div><strong>{checking ? "正在检查连接" : ready ? "音乐服务已配置" : "音乐服务尚未就绪"}</strong><p>{connectionError || (ready ? "配置已就绪；实际连接与播放权限以服务响应为准。" : connection?.message || "正在确认网易云音乐接入状态。")}</p></div>
      <button type="button" className={styles.textButton} onClick={() => void checkConnection()} disabled={checking}>{checking ? "检查中…" : "重新检查"}</button>
    </section>

    <section className={styles.login} aria-labelledby="music-login-title">
      {connection && !signedIn && !checking && <p>请先<Link href="/login?next=%2Fmusic">登录博客</Link>，然后连接自己的网易云音乐账号。</p>}
      <div className={styles.loginIntro}><h2 id="music-login-title">{authenticated ? "网易云音乐已登录" : "登录网易云音乐"}</h2><p>{authenticated ? "播放权限按你的账号权益和应用授权判断。" : "使用自己的账号授权，查看可播放歌曲与会员权益。"}</p></div>
      {!authenticated && !loginInProgress && <button type="button" className={styles.loginButton} disabled={!ready || !signedIn || checking} onClick={startLogin}>{loginStatus === "idle" ? "登录网易云" : "重新获取二维码"}</button>}
      {loginInProgress && <button type="button" className={styles.textButton} onClick={() => cancelLogin()}>取消登录</button>}
      {(loginMessage || loginQrCode) && <div className={styles.loginDetails}>
        {loginQrCode && <div className={styles.qrCode}><Image src={loginQrCode} alt="网易云音乐登录二维码，请使用网易云音乐 App 扫描" width={192} height={192} unoptimized /></div>}
        <div><p className={loginStatus === "error" ? styles.loginError : styles.loginMessage} role="status" aria-live="polite">{loginMessage}</p>{loginQrCode && loginExpiresAt && <p className={styles.loginExpiry}>有效至 {new Date(loginExpiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}，超时后停止检查。</p>}</div>
      </div>}
    </section>

    <div className={styles.columns}>
      <section className={styles.library} aria-labelledby="search-title">
        <p className={styles.eyebrow}>FIND SOMETHING YOU LOVE</p><h2 id="search-title">寻找一首歌</h2>
        <form className={styles.searchForm} onSubmit={search} role="search" aria-label="搜索网易云音乐">
          <label className={styles.srOnly} htmlFor="music-search">歌曲或歌手</label>
          <input id="music-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入歌名或歌手" maxLength={80} autoComplete="off" disabled={!ready || !authenticated} />
          <button type="submit" disabled={!ready || !authenticated || !query.trim() || searching}>{searching ? "搜索中…" : "搜索"}</button>
        </form>
        {!searched && <div className={styles.suggestions}><span>先听一首</span>{MUSIC_SUGGESTIONS.map(song => <button key={song.id} onClick={() => void playSong(song)} disabled={!ready || !authenticated || loadingSongId !== null} aria-label={`播放 ${song.name}`}>{song.name} <span aria-hidden="true">↗</span></button>)}</div>}
        <div role="status" aria-live="polite" className={styles.resultStatus}>{searching ? "正在搜索歌曲…" : searchError || (searched ? `找到 ${songs.length} 首歌曲` : "搜索后选择歌曲播放，实际权限以平台返回为准。")}</div>
        {songs.length > 0 ? <ol className={styles.songList}>
          {songs.map((song, index) => <li key={song.id} className={selectedSong?.id === song.id ? styles.activeSong : ""}>
            <span className={styles.songNumber}>{String(index + 1).padStart(2, "0")}</span>
            <div className={styles.songInfo}><h3>{song.name}</h3><p>{song.artists || "未知歌手"}{song.album ? ` · ${song.album}` : ""}</p></div>
            <span className={styles.songDuration}>{typeof song.durationMs === "number" ? formatTime(song.durationMs / 1000) : "—"}</span>
            <button type="button" className={styles.songPlay} aria-label={`播放 ${song.name}`} aria-busy={loadingSongId === song.id} disabled={loadingSongId === song.id || !ready || !authenticated} onClick={() => void playSong(song)}>{loadingSongId === song.id ? "获取中" : "播放"}</button>
          </li>)}
        </ol> : <div className={styles.empty}><MusicMark small /><p>{searching ? "稍等片刻" : searchError ? "可以修改关键词后重试" : searched ? "试试其他歌名或歌手" : "从喜欢的旋律开始"}</p></div>}
      </section>

      <section className={styles.player} aria-labelledby="now-playing-title">
        <div className={styles.playerTop}><p className={styles.playerEyebrow}>E / 沿途留声</p><span>网易云音乐</span></div>
        <div className={styles.artwork}><MusicRecord playing={playing && !waiting && music.pageVisible} coverUrl={coverUrl} /></div>
        <div className={styles.trackHeading}><h2 id="now-playing-title">{track?.name || selectedSong?.name || "等一首喜欢的歌"}</h2><p>{track?.artists || selectedSong?.artists || "选好之后，点击播放。"}</p></div>
        <div className={styles.trackStatus} role="status" aria-live="polite">{loadingSongId ? "正在获取播放权限…" : track ? <><span className={track.preview ? styles.previewBadge : styles.fullBadge}>{track.preview ? "试听" : "完整播放"}</span><span>{waiting ? "缓冲中…" : playing ? "正在播放" : currentTime >= seekMaximum && seekMaximum > 0 ? track.preview ? "试听结束" : "播放结束" : "已暂停"}</span></> : "尚未播放"}</div>
        {track?.reason && <p className={styles.permissionNote}>{track.reason}</p>}
        {activeBounds && <p className={styles.previewRange}>试听范围 {formatTime(activeBounds.start)}–{formatTime(seekMaximum)}</p>}
        <div className={styles.progress}>
          <label className={styles.srOnly} htmlFor="music-progress">播放进度</label>
          <input id="music-progress" type="range" min={seekMinimum} max={seekMaximum || 0} step={0.1} value={displayedTime} disabled={!canSeek} aria-valuetext={`${formatTime(displayedTime)}，${activeBounds ? "试听结束于" : "共"} ${formatTime(seekMaximum)}`} onChange={event => setSeekValue(Number(event.target.value))} onPointerUp={event => { commitSeek(Number(event.currentTarget.value)); setTimeout(() => setSeekValue(null), 0); }} onPointerCancel={() => setSeekValue(null)} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitSeek(Number(event.currentTarget.value)); }} onBlur={() => setSeekValue(null)} />
          <div className={styles.time}><span>{formatTime(displayedTime)}</span><span>{formatTime(seekMaximum)}</span></div>
        </div>
        <button type="button" className={styles.mainPlay} disabled={!authenticated || !track || loadingSongId !== null} onClick={() => void togglePlayback()} aria-label={playing ? "暂停播放" : "开始播放"}>{playing ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 4 13 8-13 8z" /></svg>}<span>{playing ? "暂停" : "播放"}</span></button>
        <div className={styles.volume}><label htmlFor="music-volume">音量</label><input id="music-volume" type="range" min={0} max={1} step={0.01} value={volume} aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => { changeVolume(Number(event.target.value)); }} /><span>{Math.round(volume * 100)}%</span></div>
        {playError && <p className={styles.playError} role="alert">{playError}</p>}
        <p className={styles.playerFootnote}>音乐由网易云提供。可播放范围取决于应用授权和账号权益。</p>
      </section>
    </div>
  </main>;
}
