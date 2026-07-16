import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const metadata = {
  title: "管理员登录",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect("/admin/posts");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-16">
      <section className="w-full rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">EastherPhil Blog</p>
        <h1 className="mt-3 text-3xl font-bold">管理员登录</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">登录后可以管理草稿和已发布文章。</p>
        <LoginForm />
      </section>
    </main>
  );
}
