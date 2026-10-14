import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChibiAssistant } from "@/components/assistant/chibi-assistant";

export const dynamic="force-dynamic";
export const metadata={ title:"助手交互验收",robots:{ index:false,follow:false } };
export default async function AssistantInteractionPreview() {
  if (process.env.NODE_ENV!=="development") notFound();
  const host=(await headers()).get("host")??"";
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  return <main style={{ maxWidth:900,margin:"auto",padding:"40px 24px",minHeight:"180vh" }}>
    <h1>小助手交互验收</h1><p>仅本机开发环境开放。点击右下角人物查看聊天气泡；页面应能继续滚动。</p>
    <p>此页提供可输入的开发界面，查询请求仍受真实服务端开关限制，不模拟 AI 回答。</p>
    <article style={{ marginTop:80,padding:24,border:"1px solid #d9cfb9" }}><h2>正文示例</h2><p>聊天气泡不应锁住正文、遮住人物，或改变页面滚动位置。</p><a href="#bottom">跳到页面底部</a></article>
    <div id="bottom" style={{ marginTop:"80vh" }}>底部内容仍可访问。</div>
    <ChibiAssistant floating settings={{ enabled:true,maxQuestionChars:500 }} />
  </main>;
}
