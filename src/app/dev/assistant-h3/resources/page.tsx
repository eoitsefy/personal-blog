import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AssistantActions } from "@/components/admin/assistant-actions";
export const dynamic="force-dynamic";
export const metadata={title:"动作资源本机验收",robots:{index:false,follow:false}};
export default async function ActionResourcesPreview() {
  if (process.env.NODE_ENV!=="development") notFound();
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test((await headers()).get("host")??"")) notFound();
  return <><p style={{padding:16,background:"#ffe8b1",color:"#4b391b"}}>仅本机开发验收：下面是共用的动作资源界面，不是已登录的后台。</p><AssistantActions/></>;
}
