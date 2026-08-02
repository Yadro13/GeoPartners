import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { registrationRequest, user } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getFormatter, getTranslations } from "next-intl/server";
import "../admin.css";

export default async function RegistrationsPage() {
  const t = await getTranslations("admin");
  const format = await getFormatter();
  await requireAdmin("/admin/registrations");
  const requests = await db
    .select({ request: registrationRequest, applicant: user })
    .from(registrationRequest)
    .innerJoin(user, eq(registrationRequest.userId, user.id))
    .orderBy(desc(registrationRequest.submittedAt));

  return (
    <main className="admin-shell">
      <AdminHeader />
      <div className="admin-content">
        <div className="admin-title"><span className="eyebrow">{t("administration")}</span><h1>{t("accessRequests")}</h1></div>
        {requests.length ? <div className="request-list">{requests.map(({ request, applicant }) => <Link className="request-row" href={`/admin/registrations/${request.id}`} key={request.id}><div><strong>{applicant.name}</strong><span>{applicant.email}</span></div><time>{format.dateTime(request.submittedAt, { dateStyle: "medium", timeStyle: "short" })}</time><span className="request-badge">{statusLabel(request.status, t)}</span><ChevronRight size={18} /></Link>)}</div> : <div className="admin-empty">{t("noRequests")}</div>}
      </div>
    </main>
  );
}

async function AdminHeader() {
  const t = await getTranslations("admin");
  return <header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><div className="admin-header__actions"><LanguageSwitcher compact /><Link href="/admin/users">{t("backToUsers")}</Link></div></header>;
}

function statusLabel(status: string, t: (key: "pendingShort" | "approved" | "rejected" | "suspended") => string) {
  return ({ pending: t("pendingShort"), approved: t("approved"), rejected: t("rejected"), suspended: t("suspended") } as Record<string, string>)[status] ?? status;
}
