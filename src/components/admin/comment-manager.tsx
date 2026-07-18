"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminCommentRow = {
  id: string;
  content: string;
  status: "PENDING" | "PUBLISHED" | "HIDDEN" | "SPAM";
  deletedAt: string | null;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  author: { email: string };
  post: { id: string; title: string; slug: string; commentsLocked: boolean };
  reports: { id: string; reason: string; status: "OPEN" | "RESOLVED" | "DISMISSED"; reporter: { email: string } }[];
};

const labels = { PENDING: "待审核", PUBLISHED: "已发布", HIDDEN: "已隐藏", SPAM: "垃圾信息" } as const;

export function CommentManager({ comments }: { comments: AdminCommentRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function request(path: string, init: RequestInit) {
    setMessage(""); setBusy(path);
    try {
      const response = await fetch(path, { ...init, credentials: "include", headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers });
      const body = await response.json() as { success: boolean; error?: { message?: string } };
      if (!response.ok || !body.success) throw new Error(body.error?.message ?? "操作失败");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  }

  function moderate(id: string, action: "PUBLISH" | "HIDE" | "SPAM" | "RESTORE") {
    return request(`/api/admin/comments/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
  }

  function remove(comment: AdminCommentRow) {
    if (!confirm("确认将这条评论移入回收站？")) return;
    return request(`/api/admin/comments/${comment.id}`, { method: "DELETE" });
  }

  function purge(comment: AdminCommentRow) {
    if (!confirm("永久删除这条评论及其回复？此操作无法撤销。")) return;
    return request(`/api/admin/comments/${comment.id}/purge`, { method: "DELETE" });
  }

  function toggleLock(comment: AdminCommentRow) {
    const next = !comment.post.commentsLocked;
    if (!confirm(`${next ? "锁定" : "解锁"}《${comment.post.title}》的整个评论区？`)) return;
    return request(`/api/admin/posts/${comment.post.id}/comments`, { method: "PATCH", body: JSON.stringify({ locked: next }) });
  }

  return <div className="mt-6 grid gap-4">
    {message ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    {comments.map((comment) => <article key={comment.id} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><strong>{comment.author.email}</strong><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{comment.deletedAt ? "回收站" : labels[comment.status]}</span>{comment.parentId ? <span className="text-xs text-neutral-500">一级回复</span> : null}</div><p className="mt-1 text-xs text-neutral-500">{new Date(comment.createdAt).toLocaleString("zh-CN")} · 《{comment.post.title}》</p></div>
        <a href={`/posts/${comment.post.slug}#comments-title`} target="_blank" rel="noreferrer" className="text-sm underline">查看文章</a>
      </header>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-4 leading-7 dark:bg-neutral-950">{comment.content}</p>
      {comment.reports.length ? <details className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><summary className="cursor-pointer font-medium">举报 {comment.reports.length} 条（未处理 {comment.reports.filter((report) => report.status === "OPEN").length}）</summary><ul className="mt-2 grid gap-2">{comment.reports.map((report) => <li key={report.id}>{report.reporter.email}：{report.reason} · {report.status}</li>)}</ul></details> : null}
      <footer className="mt-4 flex flex-wrap gap-4 text-sm">
        {comment.deletedAt ? <><button disabled={Boolean(busy)} onClick={() => moderate(comment.id, "RESTORE")} className="font-medium text-emerald-700 underline disabled:opacity-50">恢复为待审核</button><button disabled={Boolean(busy)} onClick={() => purge(comment)} className="font-medium text-red-700 underline disabled:opacity-50">永久删除</button></> : <><button disabled={Boolean(busy) || comment.status === "PUBLISHED"} onClick={() => moderate(comment.id, "PUBLISH")} className="underline disabled:opacity-40">发布</button><button disabled={Boolean(busy) || comment.status === "HIDDEN"} onClick={() => moderate(comment.id, "HIDE")} className="underline disabled:opacity-40">隐藏</button><button disabled={Boolean(busy) || comment.status === "SPAM"} onClick={() => moderate(comment.id, "SPAM")} className="underline disabled:opacity-40">标记垃圾</button><button disabled={Boolean(busy)} onClick={() => remove(comment)} className="text-red-700 underline disabled:opacity-50">移入回收站</button></>}
        <button disabled={Boolean(busy)} onClick={() => toggleLock(comment)} className="ml-auto underline disabled:opacity-50">{comment.post.commentsLocked ? "解锁文章评论区" : "锁定文章评论区"}</button>
      </footer>
    </article>)}
  </div>;
}
