import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminFromSessionToken,
  type AdminUser,
} from "@/lib/auth";

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
  return getAdminFromSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export async function requireAdminPage(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
