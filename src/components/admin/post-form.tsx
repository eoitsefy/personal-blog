"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreatePostInputSchema, type CreatePostInput } from "@/lib/validators/post";

type PostFormProps = {
  mode: "create" | "edit";
  postId?: string;
  initialValue?: CreatePostInput;
  categoryOptions?: string[];
  tagOptions?: string[];
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
};

export function PostForm({
  mode,
  postId,
  initialValue = EMPTY_POST,
  categoryOptions = [],
  tagOptions = [],
}: PostFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CreatePostInput>(initialValue);
  const [tagsText, setTagsText] = useState(initialValue.tags.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = useMemo(() => !submitting, [submitting]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const url = mode === "create" ? "/api/admin/posts" : `/api/admin/posts/${postId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as ApiResponse;

      if (response.status === 401) {
        router.replace("/admin/login");
        router.refresh();
        return;
      }

      if (!response.ok || !body.success) {
        setMessage(body.error?.message ?? "保存失败，请稍后重试");
        return;
      }

      router.push("/admin/posts");
      router.refresh();
    } catch {
      setMessage("保存失败：无法连接服务器");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white";

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-6" aria-label={mode === "create" ? "新建文章" : "编辑文章"}>
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

      <label className="grid gap-2">
        <span className="font-medium">正文（Markdown）</span>
        <textarea
          value={form.contentMd}
          onChange={(event) => update("contentMd", event.target.value)}
          rows={20}
          aria-invalid={Boolean(errors.contentMd)}
          className={`${fieldClass} font-mono text-sm`}
        />
        {errors.contentMd ? <span className="text-sm text-red-600">{errors.contentMd}</span> : null}
      </label>

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
          onClick={() => router.push("/admin/posts")}
          className="rounded-xl border border-neutral-300 px-5 py-3 font-medium dark:border-neutral-700"
        >
          取消
        </button>
      </div>
    </form>
  );
}
