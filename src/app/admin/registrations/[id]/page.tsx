import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/admin/DecisionForm";
import { requireAdmin } from "@/lib/access";
import { getPendingRegistration } from "@/lib/registration";
import "../../admin.css";

export default async function RegistrationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/registrations/${id}`);
  const registration = await getPendingRegistration(id);
  if (!registration) notFound();
  const { request, applicant } = registration;

  return (
    <main className="admin-shell">
      <header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><Link href="/admin/registrations"><ArrowLeft size={16} />До списку заявок</Link></header>
      <div className="admin-content">
        <div className="admin-title"><span className="eyebrow">Заявка на доступ</span><h1>{applicant.name}</h1></div>
        <div className="review-layout">
          <section className="review-data"><dl><div><dt>Ім’я</dt><dd>{applicant.name}</dd></div><div><dt>Email</dt><dd>{applicant.email}</dd></div><div><dt>Email підтверджено</dt><dd>{applicant.emailVerified ? "Так" : "Ні"}</dd></div><div><dt>Спосіб реєстрації</dt><dd>{request.method === "google" ? "Google" : "Email і пароль"}</dd></div><div><dt>Дата реєстрації</dt><dd>{request.submittedAt.toLocaleString("uk-UA")}</dd></div></dl></section>
          <DecisionForm requestId={request.id} />
        </div>
      </div>
    </main>
  );
}
