"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useDeferredValue, useRef, useState } from "react";
import { RichMarkdown } from "@/components/content/rich-markdown";
import { EditorStateSchema, editorState, insertMarkdownAtSelection } from "@/lib/editor-state";
import { usePostWorkingCopy } from "./use-post-working-copy";
import type { MediaAsset } from "@/lib/media/types";
import { parseTrustedVideoUrl } from "@/lib/media/video";
import { CreatePostInputSchema, type CreatePostInput } from "@/lib/validators/post";

type PostFormProps = {
  userId: string;
  initialUpdatedAt?: string;
  mode: "create" | "edit";
  postId?: string;
  initialValue?: CreatePostInput;
  categoryOptions?: string[];
  tagOptions?: string[];
  mediaOptions?: MediaAsset[];
  placeOptions?: { id: string; name: string; locationLabel: string; privacy: "EXACT" | "APPROXIMATE" | "CITY_ONLY" | "HIDDEN" }[];
};

type ApiResponse = {
  success: boolean;
  error?: { message?: string } | null;
};

const EMPTY_POST: CreatePostInput = {
  title: "",
  slug: "",
  excerpt: "",
  contentMd: "",
  status: "DRAFT",
  category: "",
  tags: [],
  assetIds: [],
  placeIds: [],
};

export function PostForm({
  userId,
  initialUpdatedAt,
  mode,
  postId,
  initialValue = EMPTY_POST,
  categoryOptions = [],
  tagOptions = [],
  mediaOptions = [],
  placeOptions = [],
}: PostFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CreatePostInput>(initialValue);
  const [tagsText, setTagsText] = useState(initialValue.tags.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadBusy = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [availableMedia, setAvailableMedia] = useState(mediaOptions);
  const [preview, setPreview] = useState(true);
  const previewMarkdown = useDeferredValue(form.contentMd);
  const [revisions, setRevisions] = useState<{ id: string; title: string; createdAt: string }[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const currentState = editorState(form, tagsText);
  const workingCopy = usePostWorkingCopy(currentState, { userId, postId, initialUpdatedAt });
  const canSubmit = !submitting && !uploading && !historyBusy && workingCopy.ready && !workingCopy.recoveries.length;

  function update<K extends keyof CreatePostInput>(key: K, value: CreatePostInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function toggleAsset(assetId: string) {
    update(
      "assetIds",
      form.assetIds.includes(assetId)
        ? form.assetIds.filter((id) => id !== assetId)
        : [...form.assetIds, assetId],
    );
  }

  function insertAsset(asset: MediaAsset) {
    const fallback = asset.kind === "AUDIO" ? "音频" : asset.kind === "DOCUMENT" ? "文档" : "图片";
    const title = (asset.originalName ?? fallback).replace(/[\[\]]/g, "");
    const markdown = asset.kind === "AUDIO"
      ? `[audio:${title}](${asset.url})`
      : asset.kind === "DOCUMENT"
        ? `[${title}](${asset.url})`
        : `![${title}](${asset.url})`;
    const start = textarea.current?.selectionStart ?? form.contentMd.length;
    const end = textarea.current?.selectionEnd ?? start;
    setForm((current) => ({ ...current,
      contentMd: insertMarkdownAtSelection(current.contentMd, `\n${markdown}\n`, start, end),
      assetIds: current.assetIds.includes(asset.id) ? current.assetIds : [...current.assetIds, asset.id],
    }));
  }

  async function uploadImage(file?: File) {
    if (!file || uploadBusy.current || submitting) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("粘贴或上传图片仅支持 JPEG、PNG、WebP。"); return;
    }
    if (file.size > 20 * 1024 * 1024 || form.assetIds.length >= 20) {
      setMessage("图片过大或文章已关联 20 个媒体文件。"); return;
    }
    uploadBusy.current = true;
    setUploading(true);
    setMessage("");
    try {
      const data = new FormData(); data.set("file", file);
      const response = await fetch("/api/admin/assets", { method: "POST", body: data, signal: AbortSignal.timeout(60_000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "图片上传失败");
      const asset = body.data.asset as MediaAsset;
      setAvailableMedia((current) => [asset, ...current.filter(({ id }) => id !== asset.id)]);
      insertAsset(asset);
    } catch (error) { setMessage(error instanceof Error ? error.message : "图片上传失败，请重试"); }
    finally { uploadBusy.current = false; setUploading(false); }
  }

  async function loadHistory() {
    if (!postId) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/admin/posts/${postId}/revisions`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "历史版本读取失败");
      setRevisions(body.data.revisions);
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取失败"); }
    finally { setHistoryBusy(false); }
  }

  async function restoreRevision(id: string) {
    if (!window.confirm("将历史内容载入编辑器并设为草稿；不会立即改变线上文章。继续吗？")) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/admin/posts/${postId}/revisions?revision=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "版本读取失败");
      const snapshot = EditorStateSchema.safeParse(body.data.revision.payload);
      if (!snapshot.success) throw new Error("此版本格式不兼容，当前编辑内容未改变。");
      const restored = snapshot.data;
      setForm({ ...restored.form, status: "DRAFT" }); setTagsText(restored.tagsText);
      setMessage("历史内容已载入；请检查媒体和地点后保存。保存为草稿会撤下当前公开文章。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "恢复失败"); }
    finally { setHistoryBusy(false); }
  }

  function insertVideo() {
    const video = parseTrustedVideoUrl(videoUrl);
    if (!video) {
      setVideoError("请输入哔哩哔哩或 YouTube 的 HTTPS 正式视频链接；不支持短链和其他域名。");
      return;
    }
    const title = (videoTitle.trim() || "视频").replace(/[\[\]\r\n]/g, " ").slice(0, 160).trim();
    const markdown = `[video:${title}](${video.sourceUrl})`;
    update("contentMd", `${form.contentMd.trimEnd()}${form.contentMd ? "\n\n" : ""}${markdown}\n`);
    setVideoTitle("");
    setVideoUrl("");
    setVideoError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setErrors({});
    setMessage("");

    const tags = tagsText
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const parsed = CreatePostInputSchema.safeParse({ ...form, tags });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const workingCopyVersion = await workingCopy.save(currentState);
      const url = mode === "create" ? "/api/admin/posts" : `/api/admin/posts/${postId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...parsed.data, workingCopyVersion,
          ...(mode === "edit" ? { expectedUpdatedAt: workingCopy.expectedUpdatedAt() ?? initialUpdatedAt } : {}),
        }),
      });
      const body = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        setMessage("登录已过期，请在新窗口重新登录后返回重试；不要关闭当前编辑器。");
        return;
      }

      if (!response.ok || !body.success) {
        setMessage(body.error?.message ?? "保存失败，请稍后重试");
        return;
      }

      workingCopy.finish();
      router.push("/admin/posts");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败：无法连接服务器");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white";

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-6" aria-label={mode === "create" ? "新建文章" : "编辑文章"}>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-300 p-3 text-sm dark:border-neutral-700">
        <span role="status" aria-live="polite" className="flex-1">{workingCopy.message}</span>
        <button type="button" disabled={submitting} onClick={workingCopy.retry} className="underline">重试自动保存</button>
      </div>
      {workingCopy.recoveries.length > 0 ? <section className="flex flex-wrap gap-3 rounded-xl bg-amber-100 p-4 text-sm text-neutral-900" aria-label="恢复工作副本">
        {workingCopy.recoveries.map((recovery) => <button key={recovery.label} type="button" disabled={uploading || submitting} className="rounded border px-3 py-2" onClick={() => {
          const restored = workingCopy.choose(recovery);
          if (restored) { setForm(restored.form); setTagsText(restored.tagsText); }
        }}>{recovery.label}</button>)}
        <button type="button" disabled={uploading || submitting} className="underline" onClick={() => workingCopy.choose()}>使用当前文章</button>
      </section> : null}
      <fieldset disabled={submitting || historyBusy || uploading} className="grid min-w-0 gap-6">
      <label className="grid gap-2">
        <span className="font-medium">标题</span>
        <input
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          onBlur={() => !form.slug && update("slug", slugify(form.title))}
          aria-invalid={Boolean(errors.title)}
          className={fieldClass}
        />
        {errors.title ? <span className="text-sm text-red-600">{errors.title}</span> : null}
      </label>

      <label className="grid gap-2">
        <span className="font-medium">Slug</span>
        <input
          value={form.slug}
          onChange={(event) => update("slug", slugify(event.target.value))}
          aria-invalid={Boolean(errors.slug)}
          className={fieldClass}
        />
        {errors.slug ? <span className="text-sm text-red-600">{errors.slug}</span> : null}
      </label>

      <label className="grid gap-2">
        <span className="font-medium">摘要</span>
        <textarea
          value={form.excerpt ?? ""}
          onChange={(event) => update("excerpt", event.target.value)}
          rows={3}
          aria-invalid={Boolean(errors.excerpt)}
          className={fieldClass}
        />
        {errors.excerpt ? <span className="text-sm text-red-600">{errors.excerpt}</span> : null}
      </label>

      <label className="grid gap-2">
        <span className="font-medium">状态</span>
        <select
          value={form.status}
          onChange={(event) => update("status", event.target.value as "DRAFT" | "PUBLISHED")}
          className={fieldClass}
        >
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已发布</option>
        </select>
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="font-medium">分类</span>
          <input
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
            list="category-options"
            maxLength={50}
            placeholder="例如：技术"
            aria-invalid={Boolean(errors.category)}
            className={fieldClass}
          />
          <datalist id="category-options">
            {categoryOptions.map((category) => <option key={category} value={category} />)}
          </datalist>
          {errors.category ? <span className="text-sm text-red-600">{errors.category}</span> : null}
        </label>

        <label className="grid gap-2">
          <span className="font-medium">标签</span>
          <input
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            list="tag-options"
            placeholder="用逗号分隔，最多10个"
            aria-invalid={Boolean(errors.tags)}
            className={fieldClass}
          />
          <datalist id="tag-options">
            {tagOptions.map((tag) => <option key={tag} value={tag} />)}
          </datalist>
          {errors.tags ? <span className="text-sm text-red-600">{errors.tags}</span> : null}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)} className="rounded-lg border px-3 py-2 text-sm">{preview ? "隐藏预览" : "显示预览"}</button>
        <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">{uploading ? "上传中…" : "插入图片"}
          <input type="file" aria-label="上传正文图片" accept="image/jpeg,image/png,image/webp" disabled={uploading} className="sr-only"
            onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <span className="text-xs text-neutral-500">正文可直接粘贴图片；图片沿用媒体库公开链接。</span>
      </div>
      <div className={`grid min-w-0 gap-4 ${preview ? "lg:grid-cols-2" : ""}`}>
      <label className="grid min-w-0 gap-2">
        <span className="font-medium">正文（Markdown）</span>
        <textarea
          ref={textarea}
          disabled={uploading}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (images.length) { event.preventDefault(); if (images.length > 1) setMessage("请一次粘贴一张图片。"); else void uploadImage(images[0]); }
          }}
          value={form.contentMd}
          onChange={(event) => update("contentMd", event.target.value)}
          rows={20}
          aria-invalid={Boolean(errors.contentMd)}
          className={`${fieldClass} font-mono text-sm`}
        />
        {errors.contentMd ? <span className="text-sm text-red-600">{errors.contentMd}</span> : null}
      </label>
      {preview ? <section aria-label="实时预览" className="min-w-0 rounded-xl border border-neutral-300 bg-white p-4 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
        <h2 className="mb-3 text-sm font-medium">实时预览</h2>
        <div className="editor-markdown max-h-[650px] overflow-auto break-words"><RichMarkdown markdown={previewMarkdown || "*暂无内容*"} assets={availableMedia} /></div>
      </section> : null}
      </div>

      {postId ? <section className="rounded-xl border border-neutral-300 p-4 dark:border-neutral-700" aria-label="历史版本">
        <button type="button" onClick={() => void loadHistory()} className="text-sm font-medium underline">查看历史版本</button>
        {revisions ? <div className="mt-3 grid gap-2 text-sm">
          <p className="text-neutral-500">最近 20 个保存版本。恢复后需手动保存；已删除的媒体与地点不会自动复活。</p>
          {revisions.length === 0 ? <p>首次保存后开始记录版本。</p> : revisions.map((revision) => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
            <span>{new Date(revision.createdAt).toLocaleString()} · {revision.title}</span>
            <button type="button" onClick={() => void restoreRevision(revision.id)} className="underline">载入此版本</button>
          </div>)}
        </div> : null}
      </section> : null}

      <section className="grid gap-3" aria-labelledby="post-media-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="post-media-heading" className="font-medium">文章媒体</h2>
            <p className="text-sm text-neutral-500">正式保存文章后建立媒体引用。工作副本与历史版本不保护尚未引用的文件，请勿提前删除。</p>
          </div>
          <button
            type="button"
            onClick={() => { if (workingCopy.mayLeave()) router.push("/admin/media"); }}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            管理媒体
          </button>
        </div>
        {availableMedia.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
            暂无可用媒体，请先前往媒体管理上传图片、音频或文档。
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableMedia.map((asset) => {
              const selected = form.assetIds.includes(asset.id);
              const usedInContent = form.contentMd.includes(asset.url);
              return (
                <article key={asset.id} className={`overflow-hidden rounded-xl border ${selected ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"}`}>
                  <div className="relative grid aspect-video place-items-center bg-neutral-100 dark:bg-neutral-900">
                    {asset.kind === "IMAGE" ? (
                      <Image src={asset.url} alt={asset.originalName ?? "媒体图片"} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" unoptimized />
                    ) : asset.kind === "AUDIO" ? (
                      <audio controls preload="metadata" src={asset.url} className="w-[90%]">浏览器不支持音频播放。</audio>
                    ) : (
                      <div className="grid gap-2 px-4 text-center">
                        <span className="text-xs font-medium tracking-[0.18em] text-neutral-500">DOCUMENT</span>
                        <span className="line-clamp-2 text-sm">{asset.originalName ?? "未命名文档"}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 p-3">
                    <p className="truncate text-sm" title={asset.originalName ?? asset.url}>{asset.originalName ?? "未命名图片"}</p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <button type="button" onClick={() => insertAsset(asset)} className="font-medium underline-offset-4 hover:underline">
                        插入 Markdown
                      </button>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected || usedInContent}
                          disabled={usedInContent}
                          onChange={() => toggleAsset(asset.id)}
                        />
                        保持引用
                      </label>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {errors.assetIds ? <span className="text-sm text-red-600">{errors.assetIds}</span> : null}
      </section>

      <section className="grid gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800" aria-labelledby="post-video-heading">
        <div>
          <h2 id="post-video-heading" className="font-medium">受控视频嵌入</h2>
          <p className="mt-1 text-sm text-neutral-500">仅支持哔哩哔哩和 YouTube 正式 HTTPS 链接；系统不会保存或执行任意 iframe HTML。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[0.8fr_1.4fr_auto]">
          <label className="grid gap-1 text-sm">
            <span>视频标题</span>
            <input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} maxLength={160} placeholder="例如：雨夜记录" className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>视频链接</span>
            <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} type="url" inputMode="url" placeholder="https://www.bilibili.com/video/BV..." className={fieldClass} />
          </label>
          <button type="button" onClick={insertVideo} className="self-end rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700">
            插入视频
          </button>
        </div>
        {videoError ? <p role="alert" className="text-sm text-red-600">{videoError}</p> : null}
      </section>

      <section className="grid gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800" aria-labelledby="post-place-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="post-place-heading" className="font-medium">关联地点</h2><p className="mt-1 text-sm text-neutral-500">公开文章只按地点的隐私精度展示位置；隐藏地点不会出现在公开页面或接口中。</p></div>
          <button type="button" onClick={() => { if (workingCopy.mayLeave()) router.push("/admin/places"); }} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">管理地点</button>
        </div>
        {placeOptions.length === 0 ? <p className="text-sm text-neutral-500">暂无地点，请先在地点管理中创建。</p> : <div className="grid gap-2 sm:grid-cols-2">
          {placeOptions.map((place) => <label key={place.id} className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-1" checked={form.placeIds.includes(place.id)} onChange={() => update("placeIds", form.placeIds.includes(place.id) ? form.placeIds.filter((id) => id !== place.id) : [...form.placeIds, place.id])} /><span><b className="block">{place.name}</b><span className="text-neutral-500">{place.locationLabel} · {place.privacy === "HIDDEN" ? "公开隐藏" : place.privacy === "CITY_ONLY" ? "仅地区" : place.privacy === "APPROXIMATE" ? "模糊坐标" : "精确坐标"}</span></span></label>)}
        </div>}
        {errors.placeIds ? <span className="text-sm text-red-600">{errors.placeIds}</span> : null}
      </section>

      </fieldset>
      {message ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "保存中…" : mode === "create" ? "创建文章" : "保存修改"}
        </button>
        <button
          type="button"
          disabled={submitting || uploading}
          onClick={() => { if (workingCopy.mayLeave()) router.push("/admin/posts"); }}
          className="rounded-xl border border-neutral-300 px-5 py-3 font-medium dark:border-neutral-700"
        >
          取消
        </button>
      </div>
    </form>
  );
}
