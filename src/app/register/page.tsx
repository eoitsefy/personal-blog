import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/user-auth";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-16"><section className="w-full rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm"><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">EastherPhil Journal</p><h1 className="mt-3 text-3xl font-bold">注册账号</h1><p className="mt-2 text-sm text-neutral-600">注册后可以参与评论。邮箱目前尚未验证，请使用自己的邮箱。</p><RegisterForm /><Link href="/login" className="mt-6 block text-sm underline">已有账号？登录</Link><Link href="/" className="mt-4 block text-sm underline">返回博客</Link></section></main>;
}
