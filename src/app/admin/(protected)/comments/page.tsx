import { Prisma } from "@prisma/client";
import Link from "next/link";
import { CommentManager } from "@/components/admin/comment-manager";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "评论管理" };
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE = 20;

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function href(query: { q: string; status: string; trash: boolean; page: number }, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.trash) params.set("trash", "1");
  if (page > 1) params.set("page", String(page));
  const search = params.toString(); return search ? `/admin/comments?${search}` : "/admin/comments";
}

export default async function CommentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = String(first(sp.q) ?? "").trim().slice(0, 80);
  const requestedStatus = String(first(sp.status) ?? "ALL");
  const status = ["ALL", "PENDING", "PUBLISHED", "HIDDEN", "SPAM"].includes(requestedStatus) ? requestedStatus : "ALL";
  const trash = first(sp.trash) === "1";
  const requestedPage = Math.max(1, Number(first(sp.page)) || 1);
  const where: Prisma.CommentWhereInput = {
    deletedAt: trash ? { not: null } : null,
    ...(status !== "ALL" ? { status: status as "PENDING" | "PUBLISHED" | "HIDDEN" | "SPAM" } : {}),
    ...(q ? { OR: [{ content: { contains: q, mode: "insensitive" } }, { author: { email: { contains: q, mode: "insensitive" } } }, { post: { title: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const total = await prisma.comment.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const comments = await prisma.comment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, content: true, status: true, deletedAt: true, createdAt: true, editedAt: true, parentId: true,
      author: { select: { email: true } },
      post: { select: { id: true, title: true, slug: true, commentsLocked: true } },
      reports: { orderBy: { createdAt: "desc" }, select: { id: true, reason: true, status: true, reporter: { select: { email: true } } } },
    },
  });
  const query = { q, status, trash, page };
  const serialized = comments.map((comment) => ({ ...comment, deletedAt: comment.deletedAt?.toISOString() ?? null, createdAt: comment.createdAt.toISOString(), editedAt: comment.editedAt?.toISOString() ?? null }));

  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <div><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">Phase 4B</p><h1 className="mt-2 text-3xl font-bold">评论审核</h1><p className="mt-2 text-neutral-600">审核待发布内容、处理举报与垃圾信息，并控制单篇文章评论区。</p></div>
    <div className="mt-6 flex gap-2 border-b border-neutral-200"><Link href={href({ ...query, trash: false }, 1)} className={`px-4 py-2 text-sm ${!trash ? "border-b-2 border-neutral-900 font-medium" : "text-neutral-500"}`}>当前评论</Link><Link href={href({ ...query, trash: true, status: "ALL" }, 1)} className={`px-4 py-2 text-sm ${trash ? "border-b-2 border-neutral-900 font-medium" : "text-neutral-500"}`}>回收站</Link></div>
    <form className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 p-4"><input type="hidden" name="trash" value={trash ? "1" : ""} /><label className="grid min-w-64 flex-1 gap-1 text-sm"><span>搜索</span><input name="q" type="search" maxLength={80} defaultValue={q} placeholder="评论、用户邮箱或文章标题" className="rounded-lg border border-neutral-300 px-3 py-2" /></label>{!trash ? <label className="grid gap-1 text-sm"><span>状态</span><select name="status" defaultValue={status} className="rounded-lg border border-neutral-300 px-3 py-2"><option value="ALL">全部</option><option value="PENDING">待审核</option><option value="PUBLISHED">已发布</option><option value="HIDDEN">已隐藏</option><option value="SPAM">垃圾信息</option></select></label> : null}<button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">筛选</button></form>
    <p className="mt-5 text-sm text-neutral-500">共 {total} 条</p>
    {comments.length ? <CommentManager comments={serialized} /> : <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500">没有符合条件的评论。</p>}
    <nav className="mt-8 flex justify-between"><span>{page > 1 ? <Link href={href(query, page - 1)}>上一页</Link> : "上一页"}</span><span className="text-sm text-neutral-500">第 {page} / {pages} 页</span><span>{page < pages ? <Link href={href(query, page + 1)}>下一页</Link> : "下一页"}</span></nav>
  </main>;
}
