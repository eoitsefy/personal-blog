"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserRow = { id: string; email: string; role: "USER" | "ADMIN"; status: "ACTIVE" | "DISABLED"; emailVerifiedAt: string | null; createdAt: string; sessionCount: number };

export function UserManager({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function request(path: string, init: RequestInit) {
    setMessage("");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    const body = await response.json() as { success: boolean; data?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok || !body.success) throw new Error(body.error?.message ?? "操作失败");
    return body.data ?? {};
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setBusy("invite");
    try {
      const data = await request("/api/admin/users/invitations", { method: "POST", body: JSON.stringify({ email }) });
      const url = String(data.invitationUrl);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setMessage(`邀请链接已生成并尝试复制：${url}`); setEmail("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  }

  async function setStatus(user: UserRow) {
    const status = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (status === "DISABLED" && !confirm(`确认停用 ${user.email}？其全部会话会立即失效。`)) return;
    setBusy(user.id);
    try { await request(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setMessage("账号状态已更新"); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  }

  async function reset(user: UserRow) {
    setBusy(`reset-${user.id}`);
    try {
      const data = await request(`/api/admin/users/${user.id}/password-reset`, { method: "POST" });
      const url = String(data.resetUrl);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setMessage(`密码重置链接已生成并尝试复制：${url}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  }

  return <div className="grid gap-8">
    <form onSubmit={invite} className="flex flex-wrap gap-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <label className="min-w-64 flex-1"><span className="mb-2 block text-sm font-medium">邀请邮箱</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
      <button disabled={busy === "invite"} className="self-end rounded-xl bg-neutral-900 px-5 py-3 text-white disabled:opacity-60">{busy === "invite" ? "生成中…" : "生成邀请链接"}</button>
    </form>
    {message ? <p role="status" className="break-all rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white"><table className="w-full min-w-3xl text-left text-sm"><thead className="bg-neutral-100"><tr><th className="p-4">邮箱</th><th className="p-4">角色</th><th className="p-4">状态</th><th className="p-4">有效会话</th><th className="p-4">操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-neutral-200"><td className="p-4"><strong>{user.email}</strong><div className="mt-1 text-xs text-neutral-500">{user.emailVerifiedAt ? "已验证" : "未验证"} · {new Date(user.createdAt).toLocaleDateString("zh-CN")}</div></td><td className="p-4">{user.role}</td><td className="p-4">{user.status}</td><td className="p-4">{user.sessionCount}</td><td className="p-4"><div className="flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy)} onClick={() => setStatus(user)} className="underline disabled:opacity-50">{user.status === "ACTIVE" ? "停用" : "启用"}</button><button type="button" disabled={Boolean(busy) || user.status !== "ACTIVE"} onClick={() => reset(user)} className="underline disabled:opacity-50">重置密码</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
