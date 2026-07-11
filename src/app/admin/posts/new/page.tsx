"use client";

import { useMemo, useState } from "react";
import { CreatePostInputSchema, type CreatePostInput } from "@/lib/validators/post";

type ApiSuccess<T> = { success: true; data: T; requestId: string };
type ApiFail = { success: false; error: { code: string; message: string }; requestId: string };

type CreatePostResp = ApiSuccess<{
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  createdAt: string;
}> | ApiFail;

export default function NewPostPage() {
  const [form, setForm] = useState<CreatePostInput>({
    title: "",
    slug: "",
    contentMd: "",
    status: "DRAFT",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canSubmit = useMemo(() => !submitting, [submitting]);

  function update<K extends keyof CreatePostInput>(key: K, value: CreatePostInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setErrors({});

    const parsed = CreatePostInputSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        credentials: "include",
      });

      const json = (await res.json()) as CreatePostResp;
      if (!res.ok || !json.success) {
        const msg = !json.success ? json.error.message : `请求失败（${res.status}）`;
        setMessage(`发布失败：${msg}`);
        return;
      }

      setMessage(`发布成功：${json.data.slug}`);
      setForm({ title: "", slug: "", contentMd: "", status: "DRAFT" });
    } catch {
      setMessage("发布失败：网络错误或服务器不可用");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>新建文章</h1>

      <form onSubmit={onSubmit} aria-label="新建文章表单">
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <span>标题</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              onBlur={() => !form.slug && update("slug", slugify(form.title))}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "title-error" : undefined}
              style={{ width: "100%", padding: 10 }}
            />
            {errors.title && <p id="title-error" style={{ color: "crimson" }}>{errors.title}</p>}
          </label>

          <label>
            <span>Slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => update("slug", slugify(e.target.value))}
              aria-invalid={Boolean(errors.slug)}
              aria-describedby={errors.slug ? "slug-error" : undefined}
              style={{ width: "100%", padding: 10 }}
            />
            {errors.slug && <p id="slug-error" style={{ color: "crimson" }}>{errors.slug}</p>}
          </label>

          <label>
            <span>状态</span>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value as "DRAFT" | "PUBLISHED")}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">发布</option>
            </select>
          </label>

          <label>
            <span>内容（Markdown）</span>
            <textarea
              value={form.contentMd}
              onChange={(e) => update("contentMd", e.target.value)}
              rows={14}
              aria-invalid={Boolean(errors.contentMd)}
              aria-describedby={errors.contentMd ? "content-error" : undefined}
              style={{ width: "100%", padding: 10, resize: "vertical" }}
            />
            {errors.contentMd && <p id="content-error" style={{ color: "crimson" }}>{errors.contentMd}</p>}
          </label>

          <button type="submit" disabled={!canSubmit} style={{ padding: "10px 14px" }}>
            {submitting ? "提交中..." : "提交"}
          </button>
        </div>
      </form>

      <p aria-live="polite" style={{ marginTop: 12 }}>{message}</p>
    </main>
  );
}
