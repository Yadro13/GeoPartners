import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/admin/DecisionForm";
import { RegistrationDecisionResult } from "@/components/admin/RegistrationDecisionResult";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { getRegistration } from "@/lib/registration";
import "../../admin.css";

export default async function RegistrationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/registrations/${id}`);
  const registration = await getRegistration(id);
  if (!registration) notFound();
  const { request, applicant } = registration;
  const [reviewer] = request.decidedBy ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, request.decidedBy)).limit(1) : [];

  return (
    <main className="admin-shell">
      <header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><Link href="/admin/registrations"><ArrowLeft size={16} />До списку заявок</Link></header>
      <div className="admin-content">
        <div className="admin-title"><span className="eyebrow">Заявка на доступ</span><h1>{applicant.name}</h1></div>
        <div className="review-layout">
          <section className="review-data"><dl><div><dt>Ім’я</dt><dd>{applicant.name}</dd></div><div><dt>Email</dt><dd>{applicant.email}</dd></div><div><dt>Email підтверджено</dt><dd>{applicant.emailVerified ? "Так" : "Ні"}</dd></div><div><dt>Спосіб реєстрації</dt><dd>{request.method === "google" ? "Google" : "Email і пароль"}</dd></div><div><dt>Дата реєстрації</dt><dd>{request.submittedAt.toLocaleString("uk-UA")}</dd></div></dl></section>
          {request.status === "pending" ? <DecisionForm requestId={request.id} /> : <RegistrationDecisionResult status={request.status} reviewer={reviewer ?? null} decidedAt={request.decidedAt?.toLocaleString("uk-UA") ?? "Не зафіксовано"} comment={request.comment} />}
        </div>
      </div>
    </main>
  );
}
