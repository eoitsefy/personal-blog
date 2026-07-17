import { TokenPasswordForm } from "@/components/auth/token-password-form";

export const metadata = { title: "接受邀请", robots: { index: false, follow: false } };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-16"><section className="w-full rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm"><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">Private invitation</p><h1 className="mt-3 text-3xl font-bold">接受博客邀请</h1><p className="mt-2 text-sm text-neutral-600">邀请链接只能使用一次，并将在 72 小时后过期。</p><TokenPasswordForm token={token} mode="join" /></section></main>;
}
