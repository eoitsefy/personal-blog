import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-300">
        文章不存在或尚未发布。
      </p>
      <Link href="/posts" className="mt-6 inline-block underline">
        返回文章列表
      </Link>
    </main>
  );
}
