"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { ASSISTANT_GREETINGS, parseAssistantAnswer, pickAssistantGreeting, type AssistantAnswer } from "@/lib/assistant/ui";
import styles from "./assistant-panel.module.css";

type Settings = { enabled: boolean; maxQuestionChars: number };
type Turn = { question: string; result: AssistantAnswer };

function Character({ action = "idle", small = false }: { action?: "idle" | "wave" | "thinking" | "nod"; small?: boolean }) {
  return <span className={`${styles.character} ${styles[action]}`} aria-hidden="true"><Image src="/assistant/chibi-v1.png" alt="" width={1223} height={1286} loading={small ? "lazy" : "eager"} sizes={small ? "88px" : "(max-width: 600px) 200px, 320px"} /></span>;
}

export function FloatingAssistant() {
  const pathname = usePathname();
  if (pathname === "/assistant" || pathname?.startsWith("/admin") || pathname?.startsWith("/account")) return null;
  return <ChibiAssistant floating />;
}

export function ChibiAssistant({ floating = false, settings }: { floating?: boolean; settings?: Settings }) {
  const [open, setOpen] = useState(false), [started, setStarted] = useState(false);
  const [greeting, setGreeting] = useState<string>(ASSISTANT_GREETINGS[0]);
  const [animate, setAnimate] = useState(true), [wave, setWave] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  function show() {
    if (!started) { setGreeting(pickAssistantGreeting(Math.random())); setStarted(true); }
    setWave(value => value + 1); setOpen(true);
  }
  return <div className={`${floating ? styles.floating : styles.panel} ${animate ? "" : styles.still}`}>
    {!floating ? <><h1>小助手</h1><p className={styles.invitation}>有想找的记录吗？</p></> : null}
    <button ref={trigger} type="button" className={styles.launcher} onClick={show} aria-label="打开小助手对话" aria-haspopup="dialog" aria-expanded={open}>
      <span key={wave}><Character action={wave ? "wave" : "idle"} small={floating} /></span><span className={styles.launcherLabel}>{floating ? "聊聊" : "点击和我聊聊"}</span>
    </button>
    {!floating ? <><div className={styles.introduction}>{ASSISTANT_GREETINGS[0]}</div><nav className={styles.explore} aria-label="浏览网站"><Link href="/posts">浏览日志 ↗</Link><Link href="/places">看看地点 ↗</Link></nav></> : null}
    {started ? createPortal(<AssistantDialog open={open} greeting={greeting} initialSettings={settings} animate={animate} onAnimate={() => setAnimate(value => !value)} onClose={() => setOpen(false)} returnFocus={() => trigger.current?.focus({ preventScroll: true })} />, document.body) : null}
  </div>;
}

function AssistantDialog({ open, greeting, initialSettings, animate, onAnimate, onClose, returnFocus }: {
  open: boolean; greeting: string; initialSettings?: Settings; animate: boolean; onAnimate: () => void; onClose: () => void; returnFocus: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null), messages = useRef<HTMLDivElement>(null), focus = useRef(returnFocus);
  const id = useId();
  const [question, setQuestion] = useState(""), [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState(""), [pending, setPending] = useState(false), [currentQuestion, setCurrentQuestion] = useState("");
  const [settings, setSettings] = useState<Settings | null>(initialSettings ?? null);
  const [touch, setTouch] = useState(0);

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
    const element = dialog.current!, previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element.showModal(); closeButton.current?.focus();
    const restore = focus.current;
    return () => { element.close(); document.body.style.overflow = previous; restore(); };
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { messages.current?.scrollTo({ top: messages.current.scrollHeight }); }, [turns, pending, open]);

  function close() { controller.current?.abort(); controller.current = null; setPending(false); setCurrentQuestion(""); onClose(); }
  function clear() { controller.current?.abort(); controller.current = null; setPending(false); setCurrentQuestion(""); setTurns([]); setQuestion(""); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.enabled || pending || question.trim().length < 2) return;
    const text = question.trim(), abort = new AbortController(); controller.current = abort;
    setPending(true); setCurrentQuestion(text); setError("");
    const timeout = window.setTimeout(() => abort.abort(), 25_000);
    try {
      const response = await fetch("/api/assistant/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, responseMode: "text" }), signal: abort.signal });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("助手暂时没有连接上，请稍后再试。");
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "助手暂时不可用，请稍后再试。");
      const result = parseAssistantAnswer(payload.data);
      if (controller.current !== abort) return;
      setTurns(previous => [...previous, { question: text, result }].slice(-6)); setQuestion("");
    } catch (cause) {
      if (controller.current !== abort) return;
      setError(abort.signal.aborted ? "等得有点久，请稍后重试。你的问题仍在输入框里。" : cause instanceof Error ? cause.message : "助手暂时不可用，请稍后再试。");
    } finally { window.clearTimeout(timeout); if (controller.current === abort) { controller.current = null; setPending(false); setCurrentQuestion(""); } }
  }

  return <dialog ref={dialog} className={`${styles.dialog} ${animate ? "" : styles.still}`} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled), summary, [tabindex="0"]')).filter(element => element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className={styles.header}><div><strong id={`${id}-title`}>小助手</strong><small>AI 回答仅供参考 · 公开文章检索</small></div><div className={styles.headerControls}><button className={styles.motion} type="button" onClick={onAnimate} aria-pressed={!animate}>{animate ? "暂停动作" : "开启动作"}</button><button ref={closeButton} type="button" onClick={close} aria-label="关闭小助手对话">×</button></div></header>
    <div className={styles.companion}><button type="button" aria-label="让小助手点头" onClick={() => setTouch(value => value + 1)}><span key={touch}><Character action={pending ? "thinking" : touch || turns.length ? "nod" : "wave"} small /></span></button><p>{pending ? "让我找找相关记录…" : turns.length ? "还想了解什么？" : "你好，很高兴见到你！"}</p></div>
    <div ref={messages} className={styles.messages} aria-label="对话记录" tabIndex={0}>
      <p className={styles.bubble}>{greeting}</p>
      {!turns.length ? <nav className={styles.explore} aria-label="助手推荐入口"><Link href="/posts" onClick={close}>浏览日志 ↗</Link><Link href="/places" onClick={close}>看看地点 ↗</Link></nav> : null}
      {turns.map((turn, index) => <div key={index}><p className={`${styles.bubble} ${styles.userBubble}`}>{turn.question}</p><article className={styles.bubble}><p>{turn.result.answer}</p>{turn.result.mode === "grounded" ? <small>可信度：{turn.result.confidence === "high" ? "较高" : turn.result.confidence === "medium" ? "中等" : "较低"}</small> : null}{turn.result.sources.length ? <details><summary>参考原文 · {turn.result.sources.length}</summary><ol>{turn.result.sources.map(source => <li key={source.postId}><Link href={source.url} onClick={close}>{source.title} ↗</Link><p>{source.excerpt}</p></li>)}</ol></details> : null}</article></div>)}
      {pending ? <><p className={`${styles.bubble} ${styles.userBubble}`}>{currentQuestion}</p><p className={styles.bubble} role="status">正在查找<span className={styles.dots} aria-hidden="true">…</span></p></> : null}
      <div aria-live="polite" className={styles.screenReader}>{!pending && turns.length ? turns[turns.length-1].result.answer : ""}</div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!settings ? <p role="status">正在连接助手…</p> : !settings.enabled ? <p className={styles.notice}>助手暂不可用，你仍可以浏览日志和地点。</p> : null}
    </div>
    <form className={styles.form} onSubmit={submit}><label htmlFor={`${id}-question`}>你的问题</label><textarea id={`${id}-question`} value={question} onChange={event => setQuestion(event.target.value)} maxLength={settings?.maxQuestionChars ?? 500} rows={2} disabled={!settings?.enabled || pending} placeholder="想找什么记录？" required minLength={2} /><div className={styles.formMeta}><button type="button" onClick={clear}>清空对话</button><span>{question.length} / {settings?.maxQuestionChars ?? 500}</span><button type="submit" disabled={!settings?.enabled || pending || question.trim().length < 2}>{pending ? "查找中…" : "发送 ↗"}</button></div></form>
  </dialog>;
}
