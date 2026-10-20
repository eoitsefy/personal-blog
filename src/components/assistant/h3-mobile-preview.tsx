"use client";

import { useState, useSyncExternalStore } from "react";
import { H3Character } from "./h3-character";
import { H3_CLIPS, H3_LEGACY_MOTION as H3_MOTION, type H3Clip, type H3Manifest } from "@/lib/assistant/h3-motion";
import mobileCandidate from "@/lib/assistant/releases/h3-mobile-v1/manifest.json";
import { scenePreviewPlan } from "@/lib/assistant/action-catalog";
import styles from "./h3-mobile-preview.module.css";

type Mode = "mobile" | "native" | "auto";
type Variant = Exclude<Mode, "auto">;
type Playback = {
  run: number; plan: H3Clip[]; index: number; playing: boolean; paused: boolean;
  complete: boolean; error: boolean; variant: Variant;
};
const candidate = mobileCandidate as H3Manifest;
function subscribeMobile(notify: () => void) {
  const media = matchMedia("(max-width: 600px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

export function H3MobilePreview({ initialClip = "wave", initialMode = "mobile" }: {
  initialClip?: H3Clip; initialMode?: Mode;
}) {
  const narrow = useSyncExternalStore(subscribeMobile, () => matchMedia("(max-width: 600px)").matches, () => false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selected, setSelected] = useState<H3Clip>(initialClip);
  const [background, setBackground] = useState("light");
  const [enlarged, setEnlarged] = useState(false);
  const resolved: Variant = mode === "auto" ? (narrow ? "mobile" : "native") : mode;
  const [play, setPlay] = useState<Playback>({ run: 0, plan: [initialClip], index: 0, playing: false,
    paused: false, complete: false, error: false, variant: initialMode === "native" ? "native" : "mobile" });
  // A screen rotation does not swap resources in the middle of a chronological clip.
  const variant = play.playing ? play.variant : resolved;
  const manifest = variant === "mobile" ? candidate : H3_MOTION;
  const clip = play.plan[play.index];
  const playId = play.run * 64 + play.index;
  function reset(nextClip: H3Clip, nextMode = mode) {
    setSelected(nextClip); setMode(nextMode);
    setPlay(p => ({ ...p, run: p.run + 1, plan: [nextClip], index: 0, playing: false, paused: false,
      complete: false, error: false }));
  }
  function start(plan: H3Clip[]) {
    setPlay(p => ({ run: p.run + 1, plan, index: 0, playing: true, paused: false,
      complete: false, error: false, variant: resolved }));
  }
  function finished(id: number) {
    setPlay(p => {
      if (!p.playing || id !== p.run * 64 + p.index) return p;
      return p.index + 1 < p.plan.length ? { ...p, index: p.index + 1 } : { ...p, playing: false, complete: true };
    });
  }
  return <main className={styles.page} data-mobile-candidate-preview data-resource-mode={variant}>
    <header><p className={styles.note}>本机候选 · 尚未发布</p><h1>手机动画预览</h1>
      <p>切换版本检查清晰度与流畅度。手机轻量版经过缩放和压缩，画质仍待确认。</p></header>
    <section className={styles.controls} aria-label="预览设置">
      <label>资源版本<select aria-label="资源版本" value={mode} onChange={e => reset(selected, e.target.value as Mode)}>
        <option value="mobile">手机轻量版</option><option value="native">原画质版</option><option value="auto">按屏幕选择</option>
      </select></label>
      <label>动作<select aria-label="动作" value={selected} onChange={e => reset(e.target.value as H3Clip)}>
        {H3_CLIPS.map(name => <option key={name} value={name}>{H3_MOTION.clips[name].label}</option>)}
      </select></label>
      <label>背景<select aria-label="背景" value={background} onChange={e => setBackground(e.target.value)}>
        <option value="light">浅色</option><option value="dark">深色</option><option value="check">透明棋盘</option>
      </select></label>
      <label><input type="checkbox" checked={enlarged} onChange={e => setEnlarged(e.target.checked)} />放大检查</label>
    </section>
    <section className={`${styles.stage} ${background === "dark" ? styles.dark : background === "check" ? styles.check : ""}`} aria-label="动画播放区">
      <div className={styles.actor} style={{ width: enlarged ? 320 : 140 }}>
        <H3Character key={`${variant}:${play.run}`} manifest={manifest} allowLocalCandidate={variant === "mobile"}
          clip={clip} nextClip={play.plan[play.index + 1]} playId={playId} once animate={play.playing && !play.paused}
          onFinished={finished} onFailed={() => setPlay(p => ({ ...p, playing: false, error: true }))} />
      </div>
    </section>
    <p role="status" className={styles.status}>{play.error ? "资源未能加载，请重新播放重试。" : play.complete ? "播放完成" :
      play.playing ? `${play.paused ? "已暂停" : "播放中"} · ${manifest.clips[clip].label} · ${play.index + 1}/${play.plan.length}` : "已就绪"}</p>
    <div className={styles.buttons}>
      <button onClick={() => start([selected])}>播放所选动作</button>
      <button disabled={!play.playing} onClick={() => setPlay(p => ({ ...p, paused: !p.paused }))}>{play.paused ? "继续" : "暂停"}</button>
      <button disabled={!play.playing} onClick={() => setPlay(p => ({ ...p, playing: false }))}>停止</button>
      <button onClick={() => start(["idle-blink", "idle-blink"])}>连续待机两轮</button>
      <button onClick={() => start(scenePreviewPlan("day"))}>日间完整流程</button>
      <button onClick={() => start(scenePreviewPlan("night"))}>夜间完整流程</button>
    </div>
  </main>;
}
