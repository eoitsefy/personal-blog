"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MediaAsset } from "@/lib/media/types";

type MediaManagerProps = {
  assets: MediaAsset[];
  deletedView: boolean;
  storage: {
    usedBytes: number;
    quotaBytes: number;
    remainingBytes: number;
    usagePercent: number;
  };
};

type ApiBody = { success?: boolean; error?: { message?: string } | null };

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function humanDuration(durationMs: number | null) {
  if (!durationMs) return "时长由播放器读取";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function MediaManager({ assets, deletedView, storage }: MediaManagerProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/assets", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setMessage(body.error?.message ?? "上传失败");
        return;
      }
      form.reset();
      setMessage("媒体上传成功");
      router.refresh();
    } catch {
      setMessage("无法连接服务器，请稍后重试");
    } finally {
      setUploading(false);
    }
  }

  async function mutate(asset: MediaAsset, action: "delete" | "restore" | "purge") {
    const label = asset.originalName ?? "该媒体";
    if (action === "delete" && !window.confirm(`将《${label}》移入媒体回收站吗？`)) return;
    if (action === "purge" && !window.confirm(`永久删除《${label}》及其存储文件吗？此操作无法撤销。`)) return;

    setBusyId(asset.id);
    setMessage("");
    const endpoint = action === "delete"
      ? `/api/admin/assets/${asset.id}`
      : `/api/admin/assets/${asset.id}/${action}`;
    try {
      const response = await fetch(endpoint, {
        method: action === "restore" ? "POST" : "DELETE",
        credentials: "include",
      });
      const body = (await response.json()) as ApiBody;
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setMessage(body.error?.message ?? "操作失败");
        return;
      }
      router.refresh();
    } catch {
      setMessage("无法连接服务器，请稍后重试");
    } finally {
      setBusyId("");
    }
  }

  async function copyMarkdown(asset: MediaAsset) {
    const fallback = asset.kind === "AUDIO" ? "音频" : asset.kind === "DOCUMENT" ? "文档" : "图片";
    const title = (asset.originalName ?? fallback).replace(/[\[\]]/g, "");
    const markdown = asset.kind === "AUDIO"
      ? `[audio:${title}](${asset.url})`
      : asset.kind === "DOCUMENT"
        ? `[${title}](${asset.url})`
        : `![${title}](${asset.url})`;
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage("Markdown 已复制");
    } catch {
      setMessage("复制失败，请手动复制媒体地址");
    }
  }

  return (
    <div className="mt-8 grid gap-8">
      <section className={`rounded-2xl border p-5 ${storage.usagePercent >= 80 ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`} aria-labelledby="media-storage-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="media-storage-heading" className="font-medium">媒体存储空间</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              已使用 {humanBytes(storage.usedBytes)} / {humanBytes(storage.quotaBytes)}；回收站文件在永久删除前仍占用空间。
            </p>
          </div>
          <span className="text-sm font-medium">{storage.usagePercent.toFixed(1)}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-label="媒体存储使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(storage.usagePercent)}>
          <div className={`h-full rounded-full ${storage.usagePercent >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.max(0, Math.min(100, storage.usagePercent))}%` }} />
        </div>
      </section>

      {!deletedView ? (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <label className="grid min-w-64 flex-1 gap-2">
            <span className="font-medium">上传图片、音频或文档</span>
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/opus,application/pdf,text/plain,text/markdown,.md,.markdown" required className="rounded-xl border border-neutral-300 p-3 text-sm dark:border-neutral-700" />
            <span className="text-xs text-neutral-500">支持 JPEG、PNG、WebP、MP3、WAV、OGG、Opus、PDF、UTF-8 TXT/Markdown。服务端会验证真实内容、扩展名与安全边界。</span>
          </label>
          <button type="submit" disabled={uploading} className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900">
            {uploading ? "上传中…" : "上传"}
          </button>
        </form>
      ) : null}

      {message ? <p role="status" className="rounded-xl bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900">{message}</p> : null}

      {assets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          {deletedView ? "媒体回收站为空。" : "尚未上传媒体。"}
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className="relative grid aspect-video place-items-center bg-neutral-100 dark:bg-neutral-950">
                {asset.kind === "IMAGE" ? (
                  <Image src={asset.url} alt={asset.originalName ?? "媒体图片"} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" unoptimized />
                ) : asset.kind === "AUDIO" ? (
                  <div className="grid w-full gap-3 px-4 text-center">
                    <span className="text-xs font-medium tracking-[0.18em] text-neutral-500">AUDIO / {humanDuration(asset.durationMs)}</span>
                    <audio controls preload="metadata" src={asset.url} className="w-full">浏览器不支持音频播放。</audio>
                  </div>
                ) : asset.kind === "DOCUMENT" ? (
                  <div className="grid gap-2 px-5 text-center">
                    <span className="text-xs font-medium tracking-[0.18em] text-neutral-500">DOCUMENT / {asset.mime === "application/pdf" ? "PDF" : asset.mime === "text/markdown" ? "MARKDOWN" : "TEXT"}</span>
                    <span className="line-clamp-2 text-sm font-medium">{asset.originalName ?? "未命名文档"}</span>
                  </div>
                ) : (
                  <span className="text-sm text-neutral-500">{asset.kind}</span>
                )}
              </div>
              <div className="grid gap-3 p-4">
                <div>
                  <p className="truncate font-medium" title={asset.originalName ?? asset.url}>{asset.originalName ?? "未命名媒体"}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {asset.kind} · {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}{humanBytes(asset.size)} · 引用 {asset.refCount}
                  </p>
                </div>
                <a href={asset.url} target="_blank" rel="noreferrer" download={asset.kind === "DOCUMENT" ? (asset.originalName ?? true) : undefined} className="truncate text-xs text-neutral-500 underline" title={asset.url}>{asset.kind === "DOCUMENT" ? "下载文档" : asset.url}</a>
                <div className="flex flex-wrap gap-3 text-sm">
                  {!deletedView ? (
                    <>
                      <button type="button" onClick={() => copyMarkdown(asset)} className="font-medium underline-offset-4 hover:underline">复制 Markdown</button>
                      <button
                        type="button"
                        disabled={busyId === asset.id || asset.refCount > 0}
                        onClick={() => mutate(asset, "delete")}
                        title={asset.refCount > 0 ? "请先从文章中解除引用" : undefined}
                        className="font-medium text-red-700 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        移入回收站
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={busyId === asset.id} onClick={() => mutate(asset, "restore")} className="font-medium text-emerald-700 underline-offset-4 hover:underline disabled:opacity-40">恢复</button>
                      <button type="button" disabled={busyId === asset.id || asset.refCount > 0} onClick={() => mutate(asset, "purge")} className="font-medium text-red-700 underline-offset-4 hover:underline disabled:opacity-40">永久删除</button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
