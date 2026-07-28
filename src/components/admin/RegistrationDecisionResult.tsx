import { CheckCircle2, XCircle } from "lucide-react";

export function RegistrationDecisionResult({ status, reviewer, decidedAt, comment }: {
  status: "approved" | "rejected" | "suspended";
  reviewer: { name: string; email: string } | null;
  decidedAt: string;
  comment: string | null;
}) {
  const label = status === "approved" ? "Підтверджено" : status === "rejected" ? "Відхилено" : "Призупинено";
  return <section className="decision-result" data-status={status}>
    <header>{status === "approved" ? <CheckCircle2 size={22} /> : <XCircle size={22} />}<div><span>Результат розгляду</span><strong>{label}</strong></div></header>
    <dl>
      <div><dt>Рішення прийняв</dt><dd>{reviewer ? <>{reviewer.name}<small>{reviewer.email}</small></> : "Адміністратор недоступний"}</dd></div>
      <div><dt>Дата рішення</dt><dd>{decidedAt}</dd></div>
      <div><dt>Коментар</dt><dd>{comment || "Без коментаря"}</dd></div>
    </dl>
  </section>;
}
