import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { registrationRequest, user } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getTranslations } from "next-intl/server";
import "../admin.css";

export default async function AdminUsersPage() {
  const t = await getTranslations("admin");
  const admin = await requireAdmin("/admin/users");
  const users = await db
    .select({ account: user, registrationRequestId: registrationRequest.id })
    .from(user)
    .leftJoin(registrationRequest, eq(registrationRequest.userId, user.id))
    .orderBy(desc(user.createdAt));
  const protectedEmail = process.env.ADMIN_EMAIL?.toLocaleLowerCase();
  return <main className="admin-shell"><header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><div className="admin-header__actions"><LanguageSwitcher compact /><Link href="/"><ArrowLeft size={16} />{t("toMap")}</Link></div></header><section className="admin-content admin-content--wide"><div className="admin-title admin-title--actions"><div><span className="eyebrow">{t("administration")}</span><h1>{t("users")}</h1></div><Link className="command-button" href="/admin/registrations"><ClipboardList size={17} />{t("requestHistory")}</Link></div><UserManagementTable initialUsers={users.map(({ account, registrationRequestId }) => ({ id: account.id, name: account.name, email: account.email, role: account.role, accessLevel: account.role === "admin" ? "edit" : account.accessLevel, approvalStatus: account.approvalStatus, registrationMethod: account.registrationMethod, registrationRequestId, createdAt: account.createdAt.toISOString(), protected: account.id === admin.id || account.email.toLocaleLowerCase() === protectedEmail }))} /></section></main>;
}
