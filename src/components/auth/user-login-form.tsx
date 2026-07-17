"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), audience: "USER" }),
      });
      const body = await response.json() as { success: boolean; error?: { message?: string } };
      if (!response.ok || !body.success) return setError(body.error?.message ?? "登录失败");
      router.replace("/account");
      router.refresh();
    } catch {
      setError("无法连接登录服务，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 grid gap-5">
    <label className="grid gap-2"><span className="text-sm font-medium">邮箱</span><input name="email" type="email" autoComplete="username" required className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    <label className="grid gap-2"><span className="text-sm font-medium">密码</span><input name="password" type="password" autoComplete="current-password" required minLength={12} className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    <button disabled={submitting} className="rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60">{submitting ? "登录中…" : "登录"}</button>
  </form>;
}
