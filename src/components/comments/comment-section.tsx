"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicComment } from "@/lib/comments";

type ApiEnvelope<T> = { success: boolean; data: T | null; error: { message?: string } | null };

const statusLabel = {
  PENDING: "待审核，仅你可见",
  PUBLISHED: "已发布",
  HIDDEN: "已被隐藏，仅你可见",
  SPAM: "已标记为垃圾信息，仅你可见",
} as const;

export function CommentSection({
  slug,
  initialComments,
  commentsLocked: initialLocked,
  signedIn,
}: {
  slug: string;
  initialComments: PublicComment[];
  commentsLocked: boolean;
  signedIn: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [commentsLocked, setCommentsLocked] = useState(initialLocked);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function api<T>(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    });
    const body = await response.json() as ApiEnvelope<T>;
    if (!response.ok || !body.success || !body.data) throw new Error(body.error?.message ?? "操作失败");
    return body.data;
  }

  async function refresh() {
    const data = await api<{ comments: PublicComment[]; commentsLocked: boolean }>(`/api/posts/${encodeURIComponent(slug)}/comments`);
    setComments(data.comments);
    setCommentsLocked(data.commentsLocked);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("submit"); setMessage("");
    try {
      await api(`/api/posts/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        body: JSON.stringify({ content, parentId: replyTo?.id ?? null }),
      });
      setContent(""); setReplyTo(null);
      setMessage("评论已提交，审核通过后会公开显示。");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); }
    finally { setBusy(""); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(editing.id); setMessage("");
    try {
      await api(`/api/comments/${editing.id}`, { method: "PATCH", body: JSON.stringify({ content: editing.content }) });
      setEditing(null); setMessage("评论已更新，并重新进入审核队列。"); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "编辑失败"); }
    finally { setBusy(""); }
  }

  async function remove(id: string) {
    if (!confirm("确认删除这条评论？删除后需由管理员恢复。")) return;
    setBusy(id); setMessage("");
    try { await api(`/api/comments/${id}`, { method: "DELETE" }); setMessage("评论已删除。"); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(""); }
  }

  async function report(comment: PublicComment) {
    const reason = prompt("请简要说明举报原因（2–200 字）");
    if (!reason) return;
    setBusy(comment.id); setMessage("");
    try { await api(`/api/comments/${comment.id}/reports`, { method: "POST", body: JSON.stringify({ reason }) }); setMessage("举报已提交给管理员。"); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "举报失败"); }
    finally { setBusy(""); }
  }

  function renderComment(comment: PublicComment, reply = false) {
    return <li key={comment.id} className={reply ? "ml-5 border-l border-black/15 pl-4 sm:ml-10" : ""}>
      <article className="rounded-2xl border border-black/10 bg-white/65 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <strong>{comment.authorLabel}</strong>
          <time className="text-neutral-500" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time>
        </header>
        {editing?.id === comment.id ? <form onSubmit={saveEdit} className="mt-4 grid gap-3">
          <textarea required minLength={2} maxLength={1000} rows={4} value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} className="w-full rounded-xl border border-black/20 bg-white p-3" />
          <div className="flex gap-3"><button disabled={busy === comment.id} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">保存并重新审核</button><button type="button" onClick={() => setEditing(null)} className="text-sm underline">取消</button></div>
        </form> : <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-neutral-800">{comment.content}</p>}
        <footer className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          {comment.editedAt ? <span>已编辑</span> : null}
          {comment.status !== "PUBLISHED" ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">{statusLabel[comment.status]}</span> : null}
          {!reply && signedIn && comment.status === "PUBLISHED" && !commentsLocked ? <button type="button" onClick={() => { setReplyTo({ id: comment.id, label: comment.authorLabel }); document.getElementById("comment-form")?.scrollIntoView({ behavior: "smooth" }); }} className="underline">回复</button> : null}
          {comment.isOwn ? <><button type="button" onClick={() => setEditing({ id: comment.id, content: comment.content })} className="underline">编辑</button><button type="button" disabled={busy === comment.id} onClick={() => remove(comment.id)} className="underline disabled:opacity-50">删除</button></> : null}
          {signedIn && !comment.isOwn && comment.status === "PUBLISHED" ? <button type="button" disabled={comment.reportedByViewer || busy === comment.id} onClick={() => report(comment)} className="underline disabled:opacity-50">{comment.reportedByViewer ? "已举报" : "举报"}</button> : null}
        </footer>
      </article>
      {comment.replies.length ? <ol className="mt-3 grid gap-3">{comment.replies.map((child) => renderComment(child, true))}</ol> : null}
    </li>;
  }

  const visibleCount = comments.reduce((count, comment) => count + 1 + comment.replies.length, 0);
  return <section className="mt-16 border-t border-black/15 pt-10" aria-labelledby="comments-title">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.2em] text-neutral-500">DISCUSSION LOG</p><h2 id="comments-title" className="mt-2 text-2xl font-bold">评论 · {visibleCount}</h2></div>{commentsLocked ? <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs">评论区已锁定</span> : null}</div>
    {message ? <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    {!commentsLocked && signedIn ? <form id="comment-form" onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-black/10 bg-white/70 p-5">
      {replyTo ? <div className="flex items-center justify-between text-sm"><span>回复 {replyTo.label}</span><button type="button" onClick={() => setReplyTo(null)} className="underline">取消回复</button></div> : null}
      <label htmlFor="comment-content" className="font-medium">写下评论</label>
      <textarea id="comment-content" required minLength={2} maxLength={1000} rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="2–1000 字，最多包含 2 个链接" className="w-full rounded-xl border border-black/20 bg-white p-3" />
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500"><span>提交即表示同意<Link href="/community-guidelines" className="mx-1 underline">评论规则与隐私说明</Link>；内容将进入审核队列。</span><button disabled={busy === "submit"} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy === "submit" ? "提交中…" : "提交评论"}</button></div>
    </form> : !signedIn && !commentsLocked ? <p className="mt-6 rounded-xl border border-black/10 bg-white/60 p-4 text-sm">游客可以阅读评论。<Link href={`/login?next=${encodeURIComponent(`/posts/${slug}`)}`} className="ml-1 font-medium underline">登录已验证账号后参与讨论</Link>。</p> : null}
    {comments.length ? <ol className="mt-8 grid gap-5">{comments.map((comment) => renderComment(comment))}</ol> : <p className="mt-8 rounded-2xl border border-dashed border-black/20 p-8 text-center text-neutral-500">这里还没有公开评论。</p>}
  </section>;
}
