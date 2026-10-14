import { requireAdminPage } from "@/lib/admin-auth";
import { AssistantActions } from "@/components/admin/assistant-actions";
export const metadata={title:"动作资源",robots:{index:false,follow:false}};
export default async function AssistantActionResources() {
  await requireAdminPage();
  return <AssistantActions/>;
}
