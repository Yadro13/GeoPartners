import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";

export default async function AdminUsersPage() {
  await requireAdmin("/admin/users");
  redirect("/?section=users");
}
