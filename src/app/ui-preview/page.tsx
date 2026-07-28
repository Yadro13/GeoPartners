import { notFound } from "next/navigation";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Workspace } from "@/components/workspace/Workspace";
import "../admin/admin.css";

export default async function UiPreviewPage({ searchParams }: { searchParams: Promise<{ role?: string; access?: string; google?: string; view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role, access, google, view } = await searchParams;
  if (view === "users") {
    return <main className="admin-shell"><section className="admin-content admin-content--wide"><div className="admin-title"><span className="eyebrow">Адміністрування</span><h1>Користувачі</h1></div><UserManagementTable initialUsers={[
      { id: "preview-pending", name: "Тестер", email: "tester@example.com", role: "user", accessLevel: "read", approvalStatus: "pending", registrationMethod: "password", registrationRequestId: "preview-request", createdAt: "2026-07-28T00:00:00.000Z", protected: false },
      { id: "preview-admin", name: "GeoPartners Administrator", email: "admin@example.com", role: "admin", accessLevel: "edit", approvalStatus: "approved", registrationMethod: "password", registrationRequestId: null, createdAt: "2026-07-22T00:00:00.000Z", protected: true },
    ]} /></section></main>;
  }
  return <Workspace preview googleEnabled={google === "1"} user={role === "user" ? { name: "Демо Користувач", email: "user@example.com", role: "user", accessLevel: access === "edit" ? "edit" : "read" } : undefined} />;
}
