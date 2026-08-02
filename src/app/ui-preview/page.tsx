import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { RegistrationDecisionResult } from "@/components/admin/RegistrationDecisionResult";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { AdminNavigation } from "@/components/admin/AdminNavigation";
import { Workspace } from "@/components/workspace/Workspace";
import "../admin/admin.css";

export default async function UiPreviewPage({ searchParams }: { searchParams: Promise<{ role?: string; access?: string; google?: string; view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role, access, google, view } = await searchParams;
  if (view === "users") {
    return <main className="admin-shell"><header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div></header><AdminNavigation /><section className="admin-content admin-content--wide"><div className="admin-title admin-title--actions"><div><span className="eyebrow">Адміністрування</span><h1>Користувачі</h1></div><Link className="command-button" href="/admin/registrations"><ClipboardList size={17} />Історія заявок</Link></div><UserManagementTable initialUsers={[
      { id: "preview-pending", name: "Тестер", email: "tester@example.com", role: "user", accessLevel: "read", approvalStatus: "pending", registrationMethod: "password", registrationRequestId: "preview-request", createdAt: "2026-07-28T00:00:00.000Z", protected: false },
      { id: "preview-admin", name: "GeoPartners Administrator", email: "admin@example.com", role: "admin", accessLevel: "edit", approvalStatus: "approved", registrationMethod: "password", registrationRequestId: null, createdAt: "2026-07-22T00:00:00.000Z", protected: true },
    ]} /></section></main>;
  }
  if (view === "registration-result") {
    return <main className="admin-shell"><header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div></header><AdminNavigation /><section className="admin-content"><div className="admin-title"><span className="eyebrow">Заявка на доступ</span><h1>Тестовий користувач</h1></div><div className="review-layout"><section className="review-data"><dl><div><dt>Ім’я</dt><dd>Тестовий користувач</dd></div><div><dt>Email</dt><dd>candidate@example.com</dd></div><div><dt>Email підтверджено</dt><dd>Так</dd></div><div><dt>Спосіб реєстрації</dt><dd>Google</dd></div></dl></section><RegistrationDecisionResult status="approved" reviewer={{ name: "Другий адміністратор", email: "second.admin@example.com" }} decidedAt="28.07.2026, 15:30:00" comment="Доступ підтверджено після перевірки даних користувача та погодження рівня доступу." /></div></section></main>;
  }
  return <Workspace preview googleEnabled={google === "1"} user={role === "user" ? { name: "Демо Користувач", email: "user@example.com", role: "user", accessLevel: access === "edit" ? "edit" : "read" } : undefined} />;
}
