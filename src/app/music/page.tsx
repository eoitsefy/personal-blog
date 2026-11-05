import { MusicPageContent } from "@/components/music/netease-trial";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";

export const metadata = { title: "沿途留声", description: "用网易云音乐官方播放器，让音乐陪一段阅读时光。" };
export default function MusicPage() {
  return <><SiteHeader tone="light" active="music" /><MusicPageContent /><SiteFooter /></>;
}
