"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setLoading(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) throw new Error(result.error.message ?? "Password reset request failed.");
      setSent(true);
    } catch {
      setError(t("resetRequestFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <div className="auth-success" role="status"><MailCheck size={24} /><strong>{t("checkEmail")}</strong><p>{t("resetEmailSent")}</p></div>;

  return <form className="auth-form" onSubmit={submit}>
    <label>{common("email")}<input name="email" type="email" autoComplete="email" required autoFocus /></label>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={loading} type="submit">{loading ? t("sending") : t("sendLink")}</button>
  </form>;
}
