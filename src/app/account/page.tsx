import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireUserPage } from "@/lib/user-auth";

export const metadata = { title: "我的账户", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await requireUserPage();
  return <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-16"><section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm"><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">Account</p><h1 className="mt-3 text-3xl font-bold">我的账户</h1><dl className="mt-8 grid gap-4"><div><dt className="text-sm text-neutral-500">邮箱</dt><dd className="mt-1 font-medium">{user.email}</dd></div><div><dt className="text-sm text-neutral-500">角色</dt><dd className="mt-1 font-medium">{user.role === "ADMIN" ? "管理员" : "注册用户"}</dd></div></dl><div className="mt-8 flex gap-5"><Link href="/" className="underline">返回博客</Link>{user.role === "ADMIN" ? <Link href="/admin" className="underline">管理后台</Link> : null}<LogoutButton redirectTo="/login" /></div></section></main>;
}
