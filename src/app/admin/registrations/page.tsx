import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { registrationRequest, user } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import "../admin.css";

export default async function RegistrationsPage() {
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
        <div className="admin-title"><span className="eyebrow">Адміністрування</span><h1>Заявки на доступ</h1></div>
        {requests.length ? <div className="request-list">{requests.map(({ request, applicant }) => <Link className="request-row" href={`/admin/registrations/${request.id}`} key={request.id}><div><strong>{applicant.name}</strong><span>{applicant.email}</span></div><time>{request.submittedAt.toLocaleString("uk-UA")}</time><span className="request-badge">{statusLabel(request.status)}</span><ChevronRight size={18} /></Link>)}</div> : <div className="admin-empty">Нових заявок немає.</div>}
      </div>
    </main>
  );
}

function AdminHeader() {
  return <header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><Link href="/">Повернутися до карти</Link></header>;
}

function statusLabel(status: string) {
  return ({ pending: "Очікує", approved: "Підтверджено", rejected: "Відхилено", suspended: "Призупинено" } as Record<string, string>)[status] ?? status;
}
