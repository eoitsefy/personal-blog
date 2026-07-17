import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdminPage } from "@/lib/admin-auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <nav className="flex items-center gap-5" aria-label="后台导航">
            <Link href="/admin/posts" className="font-bold">博客后台</Link>
            <Link href="/admin/posts/new" className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white">
              新建文章
            </Link>
            <Link href="/admin/media" className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white">
              媒体管理
            </Link>
            <Link href="/admin/users" className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white">
              用户管理
            </Link>
            <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white">
              查看网站
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">{admin.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
