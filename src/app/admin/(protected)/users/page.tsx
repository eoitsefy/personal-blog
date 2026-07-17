import { UserManager } from "@/components/admin/user-manager";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "用户管理" };

export default async function UsersPage() {
  const now = new Date();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, email: true, role: true, status: true, emailVerifiedAt: true, createdAt: true,
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } } } } },
    },
  });
  return <main className="mx-auto w-full max-w-6xl px-4 py-10"><div className="mb-8"><p className="text-sm uppercase tracking-[0.2em] text-neutral-500">Phase 4B</p><h1 className="mt-2 text-3xl font-bold">用户与邀请</h1><p className="mt-2 text-neutral-600">注册入口保持关闭；管理员通过一次性链接邀请可信用户。</p></div><UserManager users={users.map((user) => ({ ...user, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString(), sessionCount: user._count.sessions }))} /></main>;
}
