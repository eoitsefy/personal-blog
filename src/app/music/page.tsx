import { NeteaseTrial } from "@/components/music/netease-trial";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "沿途留声", description: "连接自己的网易云音乐账号，让音乐陪一段阅读时光。" };

export default function MusicPage() {
  return <><SiteHeader tone="light" active="music" /><NeteaseTrial /><SiteFooter /></>;
}
