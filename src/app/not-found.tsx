import Link from "next/link";
import { SiteHeader } from "@/components/site/site-shell";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#f0eee8] text-[#17191c]">
      <SiteHeader tone="light" />
      <main className="mx-auto grid min-h-[72vh] w-full max-w-[900px] place-items-center px-4 py-20 text-center">
        <div>
          <p className="font-mono text-xs tracking-[0.22em] text-[#8a681b]">LOST COORDINATE / 404</p>
          <h1 className="mt-5 font-serif text-6xl font-normal tracking-[-0.06em] sm:text-8xl">记录未找到</h1>
          <p className="mx-auto mt-6 max-w-md font-serif leading-8 text-[#565a60]">
            这条记录可能尚未公开、已经移动，或从未存在于这份档案中。
          </p>
          <Link href="/posts" className="mt-9 inline-flex border border-[#17191c] bg-[#17191c] px-5 py-3 text-sm text-white hover:bg-[#e9b949] hover:text-[#17191c]">
            返回日志索引 →
          </Link>
        </div>
      </main>
    </div>
  );
}
