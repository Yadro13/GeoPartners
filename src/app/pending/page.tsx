import Link from "next/link";
import { Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/access";
import "./pending.css";

export default async function PendingPage() {
  const currentUser = await getCurrentUser();
  const status = currentUser?.approvalStatus ?? "pending";
  const rejected = status === "rejected";

  return (
    <main className="pending-page">
      <section className="pending-panel">
        <span className="brand-mark">GP</span>
        <div className="pending-icon">{rejected ? <ShieldCheck size={30} /> : <Clock3 size={30} />}</div>
        <h1>{rejected ? "Доступ не підтверджено" : "Заявка на розгляді"}</h1>
        <p>{rejected ? "Адміністратор відхилив заявку на доступ." : "Email підтверджено. Адміністратор уже отримав повідомлення про нову реєстрацію."}</p>
        {currentUser?.reviewComment ? <div className="pending-comment"><strong>Коментар адміністратора</strong><span>{currentUser.reviewComment}</span></div> : null}
        {!rejected ? <div className="pending-steps"><span><MailCheck size={18} />Повідомлення надіслано</span><span><ShieldCheck size={18} />Очікується рішення</span></div> : null}
        <Link href="/sign-in">Повернутися до входу</Link>
      </section>
    </main>
  );
}
