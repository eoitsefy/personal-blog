"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginResponse = {
  success: boolean;
  error?: { message?: string } | null;
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as LoginResponse;

      if (!response.ok || !body.success) {
        setError(body.error?.message ?? "登录失败，请稍后重试");
        return;
      }

      router.replace("/admin/posts");
      router.refresh();
    } catch {
      setError("无法连接登录服务，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-5" aria-label="管理员登录">
      <label className="grid gap-2">
        <span className="text-sm font-medium">管理员邮箱</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">密码</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {submitting ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
