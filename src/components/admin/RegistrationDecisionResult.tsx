import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export function RegistrationDecisionResult({ status, reviewer, decidedAt, comment }: {
  status: "approved" | "rejected" | "suspended";
  reviewer: { name: string; email: string } | null;
  decidedAt: string;
  comment: string | null;
}) {
  const t = useTranslations("admin");
  const label = status === "approved" ? t("approved") : status === "rejected" ? t("rejected") : t("suspended");
  return <section className="decision-result" data-status={status}>
    <header>{status === "approved" ? <CheckCircle2 size={22} /> : <XCircle size={22} />}<div><span>{t("reviewResult")}</span><strong>{label}</strong></div></header>
    <dl>
      <div><dt>{t("decidedBy")}</dt><dd>{reviewer ? <>{reviewer.name}<small>{reviewer.email}</small></> : t("adminUnavailable")}</dd></div>
      <div><dt>{t("decisionDate")}</dt><dd>{decidedAt}</dd></div>
      <div><dt>{t("comment")}</dt><dd>{comment || t("noComment")}</dd></div>
    </dl>
  </section>;
}
