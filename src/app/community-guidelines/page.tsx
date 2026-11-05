import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";

export const metadata: Metadata = {
  title: "评论规则与隐私说明",
  description: "EastherPhil 沿途手记的评论参与规则、审核方式和最少数据使用说明。",
};

export default function CommunityGuidelinesPage() {
  return <div className="min-h-screen bg-[var(--paper)]">
    <SiteHeader tone="light" />
    <main id="main-content" className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight">评论规则与隐私说明</h1>

      <div className="mt-12 grid gap-10 leading-8 text-neutral-700">
        <section><h2 className="text-2xl font-bold text-neutral-950">参与边界</h2><ul className="mt-4 list-disc space-y-2 pl-6"><li>已注册且未停用的账号可以评论或回复；游客可以阅读已发布评论。注册邮箱目前尚未验证，请勿冒用他人邮箱。</li><li>请勿发布骚扰、仇恨、违法、冒用身份、恶意广告、脚本、跟踪链接或他人敏感个人信息。</li><li>每条评论最多 1000 字和 2 个链接，只按纯文本展示；暂不支持评论中的图片、HTML 或 Markdown。</li><li>回复只支持一级结构，避免讨论层级失控。</li></ul></section>
        <section><h2 className="text-2xl font-bold text-neutral-950">审核与处置</h2><ul className="mt-4 list-disc space-y-2 pl-6"><li>新评论默认待审核，编辑已发布评论后会重新进入审核队列。</li><li>管理员可以发布、隐藏、标记垃圾、软删除、恢复或永久删除评论，也可以锁定单篇文章的评论区。</li><li>已登录用户可以举报他人的公开评论；重复举报不会重复创建记录。</li><li>文章撤回、删除或评论区锁定后停止新增评论。</li></ul></section>
        <section><h2 className="text-2xl font-bold text-neutral-950">最少数据使用</h2><ul className="mt-4 list-disc space-y-2 pl-6"><li>账号保存邮箱、密码哈希、验证/状态信息和可撤销会话；数据库不保存原始密码或原始会话令牌。</li><li>公开评论使用匿名化读者标识，不公开用户邮箱。</li><li>评论限流将账号与请求来源组合后做单向哈希，只保存计数、时间窗口和临时阻止时间。</li><li>评论、举报及审核记录只用于运行评论功能和处理滥用。</li></ul></section>
        <section><h2 className="text-2xl font-bold text-neutral-950">音乐账号与播放</h2><p className="mt-4">使用音乐功能时，请连接自己的网易云音乐账号。授权与搜索结果按博客账号隔离，授权到期或服务重启后需要重新连接；本站不会向其他读者共享你的授权。音频由浏览器连接网易云播放，本站不保存音频文件，可播放范围以平台授权和账号权益为准。</p></section>
      </div>
      <p className="mt-12 border-t border-black/15 pt-6 text-sm text-neutral-600">如果需要删除自己的评论，可在登录后直接软删除；其他账号或隐私问题请联系博客管理员。</p>
      <Link href="/posts" className="mt-8 inline-block font-medium underline underline-offset-4">返回日志索引</Link>
    </main>
    <SiteFooter />
  </div>;
}
