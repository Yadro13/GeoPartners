"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    setError("");
    if (newPassword.length < 10) return setError(t("passwordTooShort"));
    if (newPassword !== confirmation) return setError(t("passwordConfirmationMismatch"));
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
      setComplete(true);
    } catch {
      setError(`${t("resetLinkInvalid")} ${t("requestNewLink")}.`);
    } finally {
      setLoading(false);
    }
  }

  if (complete) return <div className="auth-success" role="status"><CheckCircle2 size={24} /><strong>{t("passwordChanged")}</strong><p>{t("canSignIn")}</p><Link href="/sign-in">{t("goToSignIn")}</Link></div>;
  if (invalid || !token) return <div className="auth-error" role="alert">{t("resetLinkInvalid")} <Link href="/forgot-password">{t("requestNewLink")}</Link>.</div>;

  return <form className="auth-form" onSubmit={submit}>
    <label>{t("newPasswordTitle")}<div className="password-field"><input name="newPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required autoFocus /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("hideNewPassword") : t("showNewPassword")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small>{t("passwordHint")}</small></label>
    <label>{t("passwordConfirm")}<div className="password-field"><input name="confirmation" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required /><button type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? t("hideConfirmation") : t("showConfirmation")}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={loading} type="submit">{loading ? common("saving") : t("setNewPassword")}</button>
  </form>;
}
