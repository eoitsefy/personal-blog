"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useId, useReducer, useRef, useState } from "react";
import { ASSISTANT_GREETINGS, parseAssistantAnswer, pickAssistantGreeting, type AssistantAnswer } from "@/lib/assistant/ui";
import styles from "./assistant-panel.module.css";
import { CHARACTER_ACTIONS, CHARACTER_STAGE, type CharacterAction } from "@/lib/assistant/character";
import { CHARACTER_FRAME_VERSION, DRAWING_SEQUENCES, NEUTRAL_DRAWING, drawingDuration, drawingKey, drawingPose, drawingSample, type Drawing } from "@/lib/assistant/frame-timeline";
import { ASSISTANT_BEHAVIOR_VERSION, responseAction } from "@/lib/assistant/behavior";
import { useAssistantBehavior } from "./use-assistant-behavior";
import { useAssistantPresence } from "./use-assistant-presence";
import { SleepScene } from "./sleep-scene";
import { NaturalIdleCharacter } from "./natural-idle-character";
import { setAssistantAppearance, useAssistantAppearance } from "./use-assistant-appearance";
import { parseAppearance } from "@/lib/assistant/appearance";
import { NATURAL_MOTION, validNaturalMotion } from "@/lib/assistant/natural-motion";
import { H3Character } from "./h3-character";
import { H3_MOTION, h3Action, validH3Motion } from "@/lib/assistant/h3-motion";
import { useH3Presence } from "./use-h3-presence";
import { nextH3SceneClip } from "@/lib/assistant/h3-prefetch";
import { useBrowserVoice } from "./use-browser-voice";
import { useAssistantContext } from "./use-assistant-context";
import { socialReply } from "@/lib/assistant/social";
import { AssistantAnimationMenu } from "./assistant-animation-menu";
import { createManualPlayback, reduceManualPlayback } from "@/lib/assistant/manual-playback";

type Settings = { enabled: boolean; maxQuestionChars: number };
type Turn = { question: string; result: AssistantAnswer };

type CharacterProps = { action?: CharacterAction; small?: boolean; animate?: boolean; active?: boolean; playId?: number; once?: boolean; onFinished?: (playId: number) => void };
function Character(props: CharacterProps) {
  const appearance = useAssistantAppearance();
  return appearance === "natural" ? <NaturalIdleCharacter {...props} /> : <LegacyCharacter {...props} />;
}
function LegacyCharacter({ action = "idle", small = false, animate = true, active = true, playId = 0, once = false, onFinished }: CharacterProps) {
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLCanvasElement>(null);
  const cachedImages = useRef(new Map<string, Promise<HTMLImageElement>>());
  const neutralFrame = useRef<HTMLCanvasElement | null>(null);
  const completion = useRef(onFinished);
  useEffect(() => { completion.current = onFinished; }, [onFinished]);
  useEffect(() => { if (failed && action !== "idle") completion.current?.(playId); }, [failed, action, playId]);
  useEffect(() => {
    const element = sheet.current;
    if (!element || failed) return;
    const context = element.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let disposed = false, tick = 0, revision = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let playing: CharacterAction = action;
    let poses = new Map<string, HTMLCanvasElement>();
    let images = new Map<string, HTMLImageElement>();
    function rasterize(drawing: Drawing) {
      const key = drawingKey(drawing), existing = poses.get(key);
      if (existing) { poses.delete(key); poses.set(key, existing); return existing; }
      const pose = drawingPose(drawing), source = images.get(pose.src);
      if (!source) return undefined;
      const frame = document.createElement("canvas"); frame.width = frame.height = element!.width;
      const ctx = frame.getContext("2d", { willReadFrequently: true })!, ratio = frame.width / CHARACTER_STAGE.size;
      ctx.scale(ratio, ratio); ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, pose.x, pose.y, pose.width, pose.height, pose.left, pose.top, pose.drawWidth, pose.drawHeight);
      poses.set(key, frame);
      // Native samples increase pose count, not the bitmap memory budget.
      // Retain at most eight display-size canvases plus the source atlases.
      while (poses.size > 8) {
        const oldest = [...poses.keys()].find(k => k !== drawingKey(NEUTRAL_DRAWING));
        if (oldest) poses.delete(oldest); else break;
      }
      element!.dataset.cachedPoses = String(poses.size);
      return frame;
    }
    function draw(next: CharacterAction, time: number) {
      const sample = drawingSample(next, time);
      const from = rasterize(sample.from), to = rasterize(sample.to);
      if (!from || !to) return;
      context!.clearRect(0, 0, element!.width, element!.height);
      // Add premultiplied colours: shared body pixels stay opaque during blends.
      context!.globalCompositeOperation = "lighter";
      context!.globalAlpha = 1 - sample.mix;
      context!.drawImage(from, 0, 0);
      context!.globalAlpha = sample.mix;
      context!.drawImage(to, 0, 0);
      context!.globalAlpha = 1;
      context!.globalCompositeOperation = "source-over";
      element!.dataset.pose = drawingKey(sample.to);
      element!.dataset.blend = sample.mix.toFixed(3);
      element!.dataset.playing = next;
    }
    function play(next: CharacterAction) {
      if (animation) { animation.onfinish = null; animation.cancel(); }
      playing = next;
      const config = CHARACTER_ACTIONS[next];
      // Constant opacity is a seekable clock, never a whole-character movement.
      const loop = config.loop && (next === "idle" || !once);
      animation = element!.animate([{ opacity: 1 }, { opacity: 1 }], { duration: drawingDuration(next), iterations: loop ? Infinity : 1, fill: "none" });
      if (!loop) animation.onfinish = () => { play("idle"); completion.current?.(playId); };
      draw(next, 0);
    }
    function paint() {
      if (animation) draw(playing, Number(animation.currentTime ?? 0));
      tick = requestAnimationFrame(paint);
    }
    function refresh() {
      cancelAnimationFrame(tick);
      if (animation) { animation.onfinish = null; animation.cancel(); }
      animation = undefined;
      draw("idle", 0);
      const visible = element!.getClientRects().length > 0;
      if (animate && active && visible && !reduced.matches && !document.hidden && typeof element!.animate === "function") { play(action); tick = requestAnimationFrame(paint); }
    }
    // Keep the DOM canvas and original neutral across action changes. Loading a
    // new sheet cannot briefly show an empty canvas or another action's crop.
    element.dataset.ready = "false";
    if (neutralFrame.current) {
      context.clearRect(0, 0, element.width, element.height);
      context.drawImage(neutralFrame.current, 0, 0, element.width, element.height);
      element.dataset.pose = drawingKey(NEUTRAL_DRAWING);
    }
    const drawings = [...new Map([...DRAWING_SEQUENCES.idle, ...DRAWING_SEQUENCES[action]].map(pose => [drawingKey(pose), pose])).values()];
    const sources = new Set<string>(drawings.map(pose => drawingPose(pose).src));
    // Bound memory to idle + current action instead of retaining every atlas.
    for (const src of cachedImages.current.keys()) if (!sources.has(src)) cachedImages.current.delete(src);
    function load(src: string) {
      if (!cachedImages.current.has(src)) cachedImages.current.set(src, new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => { cachedImages.current.delete(src); reject(new Error("Character artwork unavailable")); };
        image.src = src;
      }));
      return cachedImages.current.get(src)!;
    }
    async function prepare() {
      const current = ++revision;
      try {
        const loaded = new Map(await Promise.all([...sources].map(async src => [src, await load(src)] as const)));
        if (disposed || current !== revision) return;
        // Rasterize at the displayed device-pixel size: no second enlargement
        // of a low-resolution crop and no per-pose changes to the viewport.
        const pixels = Math.round(Math.min(3, Math.max(.5, element!.getBoundingClientRect().width * devicePixelRatio / CHARACTER_STAGE.size)) * CHARACTER_STAGE.size);
        images = loaded; poses = new Map();
        if (neutralFrame.current?.width === pixels) poses.set(drawingKey(NEUTRAL_DRAWING), neutralFrame.current);
        if (element!.width !== pixels) element!.width = element!.height = pixels;
        neutralFrame.current = rasterize(NEUTRAL_DRAWING)!;
        element!.dataset.ready = "true"; element!.dataset.loadedAction = action;
        element!.dataset.frameCount = String(DRAWING_SEQUENCES[action].length);
        refresh();
      } catch { if (!disposed && current === revision) setFailed(true); }
    }
    void prepare();
    reduced.addEventListener("change", refresh); document.addEventListener("visibilitychange", refresh);
    window.addEventListener("resize", prepare);
    return () => { disposed = true; cancelAnimationFrame(tick); if (animation) { animation.onfinish = null; animation.cancel(); } reduced.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("resize", prepare); };
  }, [action, active, animate, failed, playId, once]);
  // Draw registered pose rectangles, never translate the character viewport.
  return <span className={styles.character} data-action={action} data-engine="frames" data-character-version={CHARACTER_FRAME_VERSION} aria-hidden="true">
    {failed ? <Image className={styles.fallbackCharacter} src="/assistant/chibi-neutral-left-collar-v4.png" alt="" width={768} height={768} sizes={small ? "180px" : "400px"} /> :
      <canvas ref={sheet} className={styles.spriteSheet} width={CHARACTER_STAGE.size} height={CHARACTER_STAGE.size} />}
  </span>;
}

export function FloatingAssistant() {
  const pathname = usePathname();
  if (pathname === "/assistant" || pathname?.startsWith("/admin") || pathname?.startsWith("/account")) return null;
  return <ChibiAssistant floating />;
}

export function ChibiAssistant({ floating = false, settings }: { floating?: boolean; settings?: Settings }) {
  const [open, setOpen] = useState(false), [started, setStarted] = useState(false);
  const [greeting, setGreeting] = useState<string>(ASSISTANT_GREETINGS[0]);
  const [animate, setAnimate] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manual, sendManual] = useReducer(reduceManualPlayback, undefined, createManualPlayback);
  const appearance = useAssistantAppearance();
  const legacy = appearance === "legacy";
  const h3 = appearance === "h3" && validH3Motion(H3_MOTION);
  const manualPending = manual.request !== null;
  const scene = useH3Presence(animate && h3, open || manualPending || menuOpen);
  const presence = useAssistantPresence(animate && legacy, open || manualPending || menuOpen);
  const naturalActions = validNaturalMotion(NATURAL_MOTION);
  const behavior = useAssistantBehavior(animate && !manualPending && !menuOpen && (h3 || legacy || naturalActions) && (!legacy || presence.state.phase === "awake") && (!h3 || scene.state.phase === "awake"));
  useAssistantContext(animate && h3 && !manualPending && !menuOpen && scene.state.phase === "awake",open,behavior.send);
  const phase = legacy ? presence.state.phase : "awake";
  const sleepScene = phase === "entering" || phase === "sleeping" || phase === "waking";
  const trigger = useRef<HTMLButtonElement>(null);
  const manualReady = manualPending && (!h3 || scene.state.phase === "awake") && (!legacy || phase === "awake");
  const action = manualReady ? manual.request!.action : behavior.state.action;
  const playId = manualReady ? manual.request!.playId : behavior.state.playId;
  function animationFinished(id: number) {
    if (id < 0) scene.finished(id);
    else if (id === manual.request?.playId) sendManual({ type: "finished", playId: id });
    else behavior.finished(id);
  }
  function selectAnimation(action: CharacterAction) {
    setAnimate(true);
    sendManual({ type: "select", action });
    // Existing scene exits finish in their original order before the choice plays.
    scene.send({ type: "click" }); presence.send({ type: "click" });
  }
  function show() {
    if (open) { dismiss(); return; }
    scene.send({ type: "click" });
    presence.send({ type: "click" });
    // A sleeping companion is woken first; this click never starts an AI query.
    if (phase !== "awake") return;
    if (!started) { setGreeting(pickAssistantGreeting(Math.random())); setStarted(true); }
    behavior.send({ type: "open" }); setOpen(true);
  }
  function dismiss() { behavior.send({ type: "close" }); setOpen(false); }
  return <div className={`${floating ? styles.floating : styles.panel} ${animate ? "" : styles.still}`} data-behavior-version={ASSISTANT_BEHAVIOR_VERSION} data-requested-action={action} data-action-play-id={playId} data-manual-action={manual.request?.action} data-presence={h3 ? scene.state.phase : phase} data-scene={h3 ? scene.state.scene : "legacy"}>
    {!floating ? <><h1>小助手</h1><p className={styles.invitation}>有想找的记录吗？</p></> : null}
    <button ref={trigger} type="button" className={styles.launcher} onClick={show} title={open ? "点击收起聊天，右键选择动作" : "点击聊天，右键选择动作"} aria-label={open ? "收起小助手对话" : phase === "awake" ? "打开小助手对话" : phase === "entering" || phase === "sleeping" ? "唤醒小助手" : "小助手正在起床"} aria-haspopup="dialog" aria-expanded={open}>
      <span className={styles.sceneSlot}>
        {h3 ? <H3Character clip={scene.state.clip ?? h3Action(action)} playId={scene.state.clip ? -scene.state.cycle : playId} animate={animate} once={manualReady}
          nextClip={scene.state.clip ? nextH3SceneClip(scene.state) : action !== "idle" || manualReady ? "idle-blink" : undefined}
          onFinished={animationFinished} onFailed={() => { scene.failed(); sendManual({ type: "automatic" }); }} /> :
          <Character action={phase === "recovering" ? "yawn" : sleepScene ? "idle" : action} small={floating} animate={animate} active={!sleepScene} playId={phase === "recovering" ? presence.state.cycle : playId} once onFinished={phase === "recovering" ? presence.finished : animationFinished} />}
        {sleepScene ? <SleepScene phase={phase} cycle={presence.state.cycle} animate={animate} onFinished={presence.finished} onFailed={presence.failed} /> : null}
      </span><span className={styles.screenReader}>点击人物展开聊天气泡；右键或 Shift+F10 选择动画</span>
    </button>
    <AssistantAnimationMenu trigger={trigger} onOpenChange={setMenuOpen} onSelect={selectAnimation} onAutomatic={() => sendManual({ type: "automatic" })} />
    {!floating ? <><div className={styles.introduction}>{ASSISTANT_GREETINGS[0]}</div><nav className={styles.explore} aria-label="浏览网站"><Link href="/posts">浏览日志 ↗</Link><Link href="/places">看看地点 ↗</Link></nav></> : null}
    {started ? <AssistantBubble open={open} greeting={greeting} initialSettings={settings} animate={animate} behavior={behavior} onAnimate={() => setAnimate(value => !value)} onClose={dismiss} returnFocus={() => trigger.current?.focus({ preventScroll: true })} /> : null}
  </div>;
}

function AssistantBubble({ open, greeting, initialSettings, animate, behavior, onAnimate, onClose, returnFocus }: {
  open: boolean; greeting: string; initialSettings?: Settings; animate: boolean; behavior: ReturnType<typeof useAssistantBehavior>; onAnimate: () => void; onClose: () => void; returnFocus: () => void;
}) {
  const appearance = useAssistantAppearance();
  const dialog = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null), messages = useRef<HTMLDivElement>(null), focus = useRef(returnFocus);
  const id = useId();
  const [question, setQuestion] = useState(""), [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState(""), [pending, setPending] = useState(false), [currentQuestion, setCurrentQuestion] = useState("");
  const [settings, setSettings] = useState<Settings | null>(initialSettings ?? null);
  const [readAnswers,setReadAnswers]=useState(false);
  const voice=useBrowserVoice(open,text => setQuestion(previous => (previous ? previous+" "+text : text).slice(0,settings?.maxQuestionChars??500)),setError);
  useEffect(() => {
    if (!open || !readAnswers || !turns.length || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(turns.at(-1)!.result.answer); utterance.lang="zh-CN";
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  },[open,readAnswers,turns]);

  useEffect(() => {
    if (initialSettings) return;
    const abort = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => abort.abort(), 8_000);
    fetch("/api/assistant/status", { signal: abort.signal, cache: "no-store" }).then(response => {
      if (!response.ok) throw new Error("status unavailable"); return response.json();
    }).then(payload => { if (!disposed) setSettings({ enabled: payload.feature?.enabled === true, maxQuestionChars: Number.isInteger(payload.limits?.maxQuestionChars) && payload.limits.maxQuestionChars >= 50 && payload.limits.maxQuestionChars <= 4000 ? payload.limits.maxQuestionChars : 500 }); }).catch(() => {
      if (!disposed) setSettings({ enabled: false, maxQuestionChars: 500 });
    }).finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; window.clearTimeout(timeout); abort.abort(); };
  }, [initialSettings]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const restore = focus.current;
    const key=(event:KeyboardEvent) => { if (event.key==="Escape") { event.preventDefault(); closeButton.current?.click(); } };
    document.addEventListener("keydown",key);
    return () => { document.removeEventListener("keydown",key); restore(); };
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { messages.current?.scrollTo({ top: messages.current.scrollHeight }); }, [turns, pending, open]);

  function close() { controller.current?.abort(); controller.current = null; setPending(false); setCurrentQuestion(""); onClose(); }
  function clear() { controller.current?.abort(); controller.current = null; setPending(false); setCurrentQuestion(""); setTurns([]); setQuestion(""); setError(""); behavior.send({ type: "clear" }); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.enabled || pending || question.trim().length < 2) return;
    const text = question.trim(), abort = new AbortController(); controller.current = abort;
    const social=socialReply(text);
    if (social) {
      controller.current=null; setError(""); setQuestion("");
      setTurns(previous=>[...previous,{question:text,result:social.result}].slice(-6));
      behavior.send({ type:"social",action:social.action });
      return;
    }
    setPending(true); setCurrentQuestion(text); setError(""); behavior.send({ type: "submit" });
    const timeout = window.setTimeout(() => abort.abort(), 25_000);
    try {
      const response = await fetch("/api/assistant/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, responseMode: "text" }), signal: abort.signal });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("助手暂时没有连接上，请稍后再试。");
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "助手暂时不可用，请稍后再试。");
      const result = parseAssistantAnswer(payload.data);
      if (controller.current !== abort) return;
      setTurns(previous => [...previous, { question: text, result }].slice(-6)); setQuestion("");
      behavior.send({ type: "answer", action: responseAction(text, result) });
    } catch (cause) {
      if (controller.current !== abort) return;
      behavior.send({ type: "error" });
      setError(abort.signal.aborted ? "等得有点久，请稍后重试。你的问题仍在输入框里。" : cause instanceof Error ? cause.message : "助手暂时不可用，请稍后再试。");
    } finally { window.clearTimeout(timeout); if (controller.current === abort) { controller.current = null; setPending(false); setCurrentQuestion(""); } }
  }

  return <div ref={dialog} role="dialog" aria-modal="false" hidden={!open} className={`${styles.chatBalloon} ${animate ? "" : styles.still}`} aria-labelledby={`${id}-title`}>
    <div className={styles.balloonBody}>
    <header className={styles.header}><div><strong id={`${id}-title`}>和我聊聊</strong><small>AI 回答仅供参考</small></div><div className={styles.headerControls}><button ref={closeButton} type="button" onClick={close} aria-label="关闭小助手对话">×</button></div></header>
    <details className={styles.preferences}><summary>形象与语音设置</summary><div><label className={styles.skinChoice}>助手形象<select value={appearance} onChange={event => setAssistantAppearance(parseAppearance(event.target.value))}><option value="h3">新版 · H3 完整动作</option><option value="natural">上一版 · 自然动作</option><option value="legacy">原版 · 序列帧</option></select></label><button className={styles.motion} type="button" onClick={onAnimate} aria-pressed={!animate}>{animate ? "暂停动作" : "开启动作"}</button><label><input type="checkbox" checked={readAnswers} onChange={event=>setReadAnswers(event.target.checked)} /> 朗读回复</label></div></details>
    <div ref={messages} className={styles.messages} aria-label="对话记录" tabIndex={0} onScroll={() => behavior.send({ type: "activity" })}>
      <p className={styles.bubble}>{greeting}</p>
      {!turns.length ? <nav className={styles.explore} aria-label="助手推荐入口"><Link href="/posts" onClick={close}>浏览日志 ↗</Link><Link href="/places" onClick={close}>看看地点 ↗</Link></nav> : null}
      {turns.map((turn, index) => <div key={index}><p className={`${styles.bubble} ${styles.userBubble}`}>{turn.question}</p><article className={styles.bubble}><p>{turn.result.answer}</p>{turn.result.mode === "grounded" ? <small>可信度：{turn.result.confidence === "high" ? "较高" : turn.result.confidence === "medium" ? "中等" : "较低"}</small> : null}{turn.result.sources.length ? <details><summary>参考原文 · {turn.result.sources.length}</summary><ol>{turn.result.sources.map(source => <li key={source.postId}><Link href={source.url} onClick={close}>{source.title} ↗</Link><p>{source.excerpt}</p></li>)}</ol></details> : null}</article></div>)}
      {pending ? <><p className={`${styles.bubble} ${styles.userBubble}`}>{currentQuestion}</p><p className={styles.bubble} role="status">正在查找<span className={styles.dots} aria-hidden="true">…</span></p></> : null}
      <div aria-live="polite" className={styles.screenReader}>{!pending && turns.length ? turns[turns.length-1].result.answer : ""}</div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!settings ? <p role="status">正在连接助手…</p> : !settings.enabled ? <p className={styles.notice}>助手暂不可用，你仍可以浏览日志和地点。</p> : null}
    </div>
    <form className={styles.form} onSubmit={submit} onPointerDown={() => behavior.send({ type: "activity" })}><label className={styles.screenReader} htmlFor={`${id}-question`}>你的问题</label><textarea id={`${id}-question`} value={question} onFocus={() => behavior.send({ type: "activity" })} onChange={event => { setQuestion(event.target.value); behavior.send({ type: "activity" }); }} maxLength={settings?.maxQuestionChars ?? 500} rows={2} disabled={!settings?.enabled || pending} placeholder="想聊些什么，或找哪篇记录？" required minLength={2} /><div className={styles.formMeta}><button type="button" onClick={clear} aria-label="清空对话">清空</button><button type="button" onClick={voice.toggle} disabled={!voice.available || !settings?.enabled || pending} aria-label={voice.listening?"停止语音输入":"语音输入"} aria-pressed={voice.listening} title={voice.available?"首次使用需允许麦克风，由浏览器提供识别":"此浏览器暂不支持语音输入，可使用文字"}>{voice.listening?"停止":"语音"}</button><span>{question.length}/{settings?.maxQuestionChars ?? 500}</span><button type="submit" disabled={!settings?.enabled || pending || question.trim().length < 2}>{pending ? "查找中…" : "发送 ↗"}</button></div>{voice.listening?<small role="status">正在听… 语音识别由浏览器提供。</small>:null}</form>
    </div>
  </div>;
}
