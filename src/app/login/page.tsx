import Link from "next/link";
import { redirect } from "next/navigation";
import { UserLoginForm } from "@/components/auth/user-login-form";
import { getCurrentUser } from "@/lib/user-auth";

export const metadata = { title: "用户登录", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/account");
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-16"><section className="w-full rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm"><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">EastherPhil Journal</p><h1 className="mt-3 text-3xl font-bold">用户登录</h1><p className="mt-2 text-sm text-neutral-600">目前仅接受管理员邀请注册。</p><UserLoginForm /><Link href="/" className="mt-6 block text-sm underline">返回博客</Link></section></main>;
}
