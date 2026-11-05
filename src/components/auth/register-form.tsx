"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const result = await response.json() as { success: boolean; error?: { message?: string } };
      if (!response.ok || !result.success) { setError(result.error?.message ?? "注册失败"); return; }
      router.replace("/account"); router.refresh();
    } catch { setError("无法连接注册服务，请稍后重试"); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-8 grid gap-5">
    <label className="grid gap-2"><span className="text-sm font-medium">邮箱</span><input name="email" type="email" autoComplete="email" required maxLength={120} className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    <label className="grid gap-2"><span className="text-sm font-medium">密码</span><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="rounded-xl border border-neutral-300 bg-white px-4 py-3" /></label>
    <p className="text-sm text-neutral-600">密码至少 12 个字符，包含大写、小写字母和数字，且不超过 72 字节。</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60">{busy ? "注册中…" : "注册"}</button>
  </form>;
}
