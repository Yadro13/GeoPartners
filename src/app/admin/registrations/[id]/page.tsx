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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getFormatter, getTranslations } from "next-intl/server";
import "../../admin.css";

export default async function RegistrationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const { id } = await params;
  await requireAdmin(`/admin/registrations/${id}`);
  const registration = await getRegistration(id);
  if (!registration) notFound();
  const { request, applicant } = registration;
  const [reviewer] = request.decidedBy ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, request.decidedBy)).limit(1) : [];

  return (
    <main className="admin-shell">
      <header className="admin-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><div className="admin-header__actions"><LanguageSwitcher compact /><Link href="/admin/registrations"><ArrowLeft size={16} />{t("backToRequests")}</Link></div></header>
      <div className="admin-content">
        <div className="admin-title"><span className="eyebrow">{t("requestTitle")}</span><h1>{applicant.name}</h1></div>
        <div className="review-layout">
          <section className="review-data"><dl><div><dt>{t("user")}</dt><dd>{applicant.name}</dd></div><div><dt>Email</dt><dd>{applicant.email}</dd></div><div><dt>{t("emailVerified")}</dt><dd>{applicant.emailVerified ? t("yes") : t("no")}</dd></div><div><dt>{t("registrationMethod")}</dt><dd>{request.method === "google" ? "Google" : t("emailPassword")}</dd></div><div><dt>{t("registrationDate")}</dt><dd>{format.dateTime(request.submittedAt, { dateStyle: "medium", timeStyle: "short" })}</dd></div></dl></section>
          {request.status === "pending" ? <DecisionForm requestId={request.id} /> : <RegistrationDecisionResult status={request.status} reviewer={reviewer ?? null} decidedAt={request.decidedAt ? format.dateTime(request.decidedAt, { dateStyle: "medium", timeStyle: "short" }) : t("notRecorded")} comment={request.comment} />}
        </div>
      </div>
    </main>
  );
}
