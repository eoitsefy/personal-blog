import Link from "next/link";
import { SiteHeader } from "@/components/site/site-shell";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#f0eee8] text-[#17191c]">
      <SiteHeader tone="light" />
      <main className="mx-auto grid min-h-[72vh] w-full max-w-[900px] place-items-center px-4 py-20 text-center">
        <div>
          <h1 className="font-serif text-6xl font-normal tracking-[-0.06em] sm:text-8xl">记录未找到</h1>
          <Link href="/posts" className="mt-9 inline-flex border border-[#17191c] bg-[#17191c] px-5 py-3 text-sm text-white hover:bg-[#e9b949] hover:text-[#17191c]">
            返回日志索引 →
          </Link>
        </div>
      </main>
    </div>
  );
}
