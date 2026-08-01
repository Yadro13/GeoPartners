import Link from "next/link";
import { Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/access";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "./pending.css";

export default async function PendingPage() {
  const currentUser = await getCurrentUser();
  const t = await getTranslations();
  const status = currentUser?.approvalStatus ?? "pending";
  const rejected = status === "rejected";

  return (
    <main className="pending-page">
      <section className="pending-panel">
        <div className="pending-toolbar"><span className="brand-mark">GP</span><LanguageSwitcher compact /></div>
        <div className="pending-icon">{rejected ? <ShieldCheck size={30} /> : <Clock3 size={30} />}</div>
        <h1>{rejected ? t("pending.rejectedTitle") : t("pending.pendingTitle")}</h1>
        <p>{rejected ? t("pending.rejectedText") : t("pending.pendingText")}</p>
        {currentUser?.reviewComment ? <div className="pending-comment"><strong>{t("pending.adminComment")}</strong><span>{currentUser.reviewComment}</span></div> : null}
        {!rejected ? <div className="pending-steps"><span><MailCheck size={18} />{t("pending.messageSent")}</span><span><ShieldCheck size={18} />{t("pending.awaitingDecision")}</span></div> : null}
        <Link href="/sign-in">{t("auth.backToSignIn")}</Link>
      </section>
    </main>
  );
}
