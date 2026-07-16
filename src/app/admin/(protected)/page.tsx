import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function AdminPage() {
  await requireAdminPage();
  redirect("/admin/posts");
}
