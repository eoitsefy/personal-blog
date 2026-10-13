"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { NaturalRuntimeManifest } from "@/lib/assistant/natural-motion";
import { NaturalMotionCanvas } from "./natural-idle-character";
import styles from "./natural-motion-preview.module.css";

function snapshot() { return !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches; }
function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify); document.addEventListener("visibilitychange", notify);
  return () => { media.removeEventListener("change", notify); document.removeEventListener("visibilitychange", notify); };
}

export function NaturalMotionPreview({ manifest }: { manifest: NaturalRuntimeManifest }) {
  const environmentAvailable = useSyncExternalStore(subscribe, snapshot, () => false);
  const [open, setOpen] = useState(false), [animate, setAnimate] = useState(true);
  const [reduced, setReduced] = useState(false), [hidden, setHidden] = useState(false);
  const [size, setSize] = useState("desktop"), [background, setBackground] = useState("light");
  const [request, setRequest] = useState<{ action: "idle" | "wave" | "bow" | "thinking"; playId: number }>({ action: "idle", playId: 0 });
  const [events, setEvents] = useState<string[]>([]), [callbacks, setCallbacks] = useState<Record<string, number>>({});
  const [frames, setFrames] = useState<string[]>([]), [failures, setFailures] = useState<string[]>([]);
  const area = useRef<HTMLDivElement>(null), switches = useRef<number[]>([]);
  const available = environmentAvailable && !reduced && !hidden;
  const finished = useCallback((owner: string, id: number) => {
    const key = `${owner}:${id}`;
    setCallbacks(previous => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
    setEvents(previous => [`${owner} 完成 playId=${id}`, ...previous].slice(0, 20));
    setRequest(previous => previous.playId === id ? { action: "idle", playId: id + 1 } : previous);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrames(Array.from(area.current?.querySelectorAll<HTMLCanvasElement>("canvas") ?? []).map((canvas, i) =>
        `${i === 0 ? "launcher" : "dialog"}: action=${canvas.dataset.playing ?? "static"}, frame=${canvas.dataset.frame ?? "-"}, ready=${canvas.dataset.ready ?? "false"}, canvas=${canvas.style.visibility || "default"}`));
    }, 150);
    return () => { window.clearInterval(timer); switches.current.forEach(window.clearTimeout); };
  }, []);
  function play(action: "wave" | "bow" | "thinking") {
    if (manifest.clips[action]) setRequest(previous => ({ action, playId: previous.playId + 1 }));
  }
  function handoff(next: boolean) {
    setOpen(next);
    setRequest(previous => ({ action: next ? "wave" : "idle", playId: previous.playId + 1 }));
  }
  function rapidSwitch() {
    switches.current.forEach(window.clearTimeout);
    switches.current = Array.from({ length: 8 }, (_, index) => window.setTimeout(() => handoff(index % 2 === 0), index * 120));
  }
  const widths = size === "mobile" ? [128, 120] : size === "native" ? [manifest.width, manifest.width] : [180, 160];
  const candidateWave = Object.values(manifest.assets).some(asset => asset.src.startsWith("/api/dev/assistant-motion/") && /\/wave-\d+\.webp(?:\?|$)/.test(asset.src));
  const countsByPlayId = Object.entries(callbacks).reduce<Record<string, number>>((counts, [key, count]) => {
    const id = key.slice(key.lastIndexOf(":") + 1); counts[id] = (counts[id] ?? 0) + count; return counts;
  }, {});
  const failure = (owner: string) => setFailures(previous => previous.includes(owner) ? previous : [...previous, owner]);
  return <main className={styles.page}>
    <h1>候选动画 · 本地验收</h1>
    <p>状态：PENDING，未批准、未部署。使用正式播放器同一个组件，不修改审查结果。</p>
    <p>候选：<code>{manifest.version}</code>；待机 {manifest.clips.idle.frames.length} 帧，挥手 {manifest.clips.wave?.frames.length ?? 0} 帧，鞠躬 {manifest.clips.bow?.frames.length ?? 0} 帧，思考 {manifest.clips.thinking?.frames.length ?? 0} 帧。</p>
    {candidateWave ? <p>资源测试（重新载入页面）：<a href="/dev/assistant-motion">正常</a> · <a href="?assetTest=fail-wave">挥手页加载失败</a> · <a href="?assetTest=delay-1200">挥手页延迟 1200ms</a>；当前：{Object.values(manifest.assets)[0]?.src.split("assetTest=")[1] ?? "正常"}。</p>
      : <p>待机与挥手使用已核验的旧版公开资源；本页新增鞠躬、思考仍为本地候选。旧挥手的故障模拟不适用于直接继承的资源。</p>}
    <div className={styles.controls}>
      <button type="button" disabled={!manifest.clips.wave} onClick={() => play("wave")}>待机 → 挥手 → 待机</button>
      <button type="button" disabled={!manifest.clips.bow} onClick={() => play("bow")}>待机 → 鞠躬 → 待机</button>
      <button type="button" disabled={!manifest.clips.thinking} onClick={() => play("thinking")}>待机 → 思考 → 待机</button>
      <button type="button" onClick={() => handoff(!open)}>{open ? "关闭对话框" : "打开对话框并挥手"}</button>
      <button type="button" onClick={rapidSwitch}>快速切换 8 次</button>
      <button type="button" onClick={() => { setCallbacks({}); setEvents([]); setFailures([]); }}>清空记录</button>
      <label><input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} />开启动画</label>
      <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />模拟 reduced-motion</label>
      <label><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} />模拟页面隐藏</label>
      <label>尺寸<select value={size} onChange={event => setSize(event.target.value)}><option value="desktop">桌面实际尺寸 180 / 160</option><option value="mobile">移动端尺寸 128 / 120</option><option value="native">480 像素检查</option></select></label>
      <label>底色<select value={background} onChange={event => setBackground(event.target.value)}><option value="light">浅色</option><option value="dark">深色</option><option value="checker">透明棋盘</option></select></label>
    </div>
    <p>active：{open ? "dialog" : "launcher"}；环境允许动画：{String(environmentAvailable)}；有效 available：{String(available)}；请求 {request.action} / {request.playId}</p>
    <div ref={area} className={`${styles.stage} ${styles[background]}`}>
      <section><h2>页面启动器</h2><div style={{ width: widths[0] }}>
        <NaturalMotionCanvas manifest={manifest} action={open ? "idle" : request.action} playId={request.playId} once
          animate={animate} active={!open} available={available} onFinished={id => finished("launcher", id)} onFailed={() => failure("launcher")} />
      </div><small>{open ? "inactive：应停止动作，不请求整套图集" : "active"}</small></section>
      <section><h2>对话框角色</h2><div style={{ width: widths[1], display: open ? "block" : "none" }}>
        <NaturalMotionCanvas manifest={manifest} action={open ? request.action : "idle"} playId={request.playId} once
          animate={animate} active={open} available={available} onFinished={id => finished("dialog", id)} onFailed={() => failure("dialog")} />
      </div><small>{open ? "active" : "inactive：保持挂载但不显示"}</small></section>
    </div>
    <section className={styles.readout}><h2>实时状态</h2><pre>{frames.join("\n")}</pre>
      <p>加载失败：{failures.length ? failures.join(", ") : "无"}</p>
      <p>完成回调总数：{Object.values(callbacks).reduce((sum, count) => sum + count, 0)}；重复回调（含跨实例）：{Object.values(countsByPlayId).some(count => count > 1) ? "有，请排查" : "无"}</p>
      <pre>{JSON.stringify(callbacks, null, 2)}</pre><pre>{events.join("\n")}</pre>
    </section>
    <p>验收建议：完整播放一次，明暗底各一次；快速切换、暂停/恢复、模拟隐藏/恢复；最后真实切换浏览器标签页再返回。通过之后再独立填写报告。</p>
  </main>;
}
