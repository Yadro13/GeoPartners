"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function DecisionForm({ requestId }: { requestId: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setLoading(decision);
    setError(null);
    const response = await fetch(`/api/admin/registrations/${requestId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
    });
    setLoading(null);
    if (!response.ok) {
      if (response.status === 409) {
        router.refresh();
        return;
      }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return setError(body?.error ?? t("decisionFailed"));
    }
    router.push("/admin/registrations");
    router.refresh();
  }

  return (
    <div className="decision-form">
      <label>{t("userComment")} <span>{t("optional")}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={4} placeholder={t("commentPlaceholder")} /></label>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <div className="decision-actions">
        <button className="decision-button decision-button--approve" disabled={Boolean(loading)} type="button" onClick={() => decide("approved")}><Check size={18} />{loading === "approved" ? t("saving") : t("approve")}</button>
        <button className="decision-button decision-button--reject" disabled={Boolean(loading)} type="button" onClick={() => decide("rejected")}><X size={18} />{loading === "rejected" ? t("saving") : t("reject")}</button>
      </div>
    </div>
  );
}
