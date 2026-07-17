"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TokenPasswordForm({ token, mode }: { token: string; mode: "join" | "reset" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) return setError("两次输入的密码不一致");
    setSubmitting(true);
    try {
      const response = await fetch(mode === "join" ? "/api/auth/invitations/accept" : "/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json() as { success: boolean; error?: { message?: string } };
      if (!response.ok || !body.success) return setError(body.error?.message ?? "操作失败");
      if (mode === "join") {
        router.replace("/account");
        router.refresh();
      } else {
        setDone(true);
      }
    } catch {
      setError("无法连接服务，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) return <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">链接缺少一次性令牌。</p>;
  if (done) return <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-800">密码已更新。<button className="ml-2 underline" onClick={() => router.replace("/login")}>前往登录</button></div>;
  return <form onSubmit={submit} className="mt-8 grid gap-5">
    <p className="text-sm text-neutral-600">密码至少 12 位，并同时包含大写字母、小写字母和数字。</p>
    <label className="grid gap-2"><span className="text-sm font-medium">新密码</span><input name="password" type="password" autoComplete="new-password" required minLength={12} className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    <label className="grid gap-2"><span className="text-sm font-medium">确认密码</span><input name="confirmation" type="password" autoComplete="new-password" required minLength={12} className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    <button disabled={submitting} className="rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60">{submitting ? "提交中…" : mode === "join" ? "接受邀请并注册" : "更新密码"}</button>
  </form>;
}
