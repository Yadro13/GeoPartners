import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import "../admin.css";

export default async function AdminUsersPage() {
  const admin = await requireAdmin("/admin/users");
  const users = await db.select().from(user).orderBy(desc(user.createdAt));
  const protectedEmail = process.env.ADMIN_EMAIL?.toLocaleLowerCase();
  return <main className="admin-shell"><header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><Link href="/"><ArrowLeft size={16} />До карти</Link></header><section className="admin-content admin-content--wide"><div className="admin-title"><span className="eyebrow">Адміністрування</span><h1>Користувачі</h1></div><UserManagementTable initialUsers={users.map((item) => ({ id: item.id, name: item.name, email: item.email, role: item.role, approvalStatus: item.approvalStatus, registrationMethod: item.registrationMethod, createdAt: item.createdAt.toISOString(), protected: item.id === admin.id || item.email.toLocaleLowerCase() === protectedEmail }))} /></section></main>;
}
