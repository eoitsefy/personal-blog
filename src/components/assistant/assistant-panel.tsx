"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./assistant-panel.module.css";

type Source = { postId: string; title: string; url: string; excerpt: string };
type Answer = { answer: string; sources: Source[]; confidence: "high" | "medium" | "low"; mode: "grounded" | "conversation" | "no_evidence" };

export function AssistantPanel({ enabled, maxQuestionChars }: { enabled: boolean; maxQuestionChars: number }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending) return;
    setPending(true);
    setError("");
    setAnswer(null);
    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, responseMode: "text" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "助手请求失败");
      setAnswer(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "助手暂时不可用，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.panel} aria-labelledby="assistant-heading">
    <h1 id="assistant-heading">助手</h1>
    <form onSubmit={submit} className={styles.form}>
      <label htmlFor="assistant-question">你的问题</label>
      <textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={2} maxLength={maxQuestionChars} rows={5} disabled={!enabled || pending} placeholder="输入问题" required />
      <div className={styles.formMeta}><span>{question.length} / {maxQuestionChars}</span><button disabled={!enabled || pending || question.trim().length < 2}>{pending ? "正在检索…" : "检索并回答"}</button></div>
    </form>
    {!enabled ? <div className={styles.notice}><strong>助手暂不可用</strong></div> : null}
    {error ? <div className={styles.error} role="alert"><strong>本次请求未完成</strong><p>{error}</p></div> : null}
    {answer ? <article className={styles.answer} aria-live="polite"><header><small>可信度：{answer.confidence === "high" ? "较高" : answer.confidence === "medium" ? "中等" : "较低"}</small></header><p>{answer.answer}</p><section><h2>参考原文</h2>{answer.sources.length ? <ol>{answer.sources.map((source) => <li key={source.postId}><Link href={source.url}>{source.title} <span>↗</span></Link><p>{source.excerpt}</p></li>)}</ol> : <p>{answer.mode === "conversation" ? "未引用文章。" : "未找到相关公开文章。"}</p>}</section></article> : null}
  </section>;
}
