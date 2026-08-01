"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { oauthErrorKey } from "@/lib/auth-errors";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const oauthKey = oauthErrorKey(searchParams.get("error"));
  const visibleError = error ?? (oauthKey ? t(oauthKey) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("passwordConfirm"))) return setError(t("passwordsMismatch"));
    setLoading("email");
    setError(null);
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password,
      callbackURL: "/pending",
    });
    setLoading(null);
    if (result.error) return setError(t("accountCreationFailed"));
    setSent(true);
  }

  async function signUpWithGoogle() {
    setLoading("google");
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/pending",
      newUserCallbackURL: "/pending",
      errorCallbackURL: "/sign-up",
    });
    if (result.error) {
      setLoading(null);
      setError(t("googleRegistrationFailed"));
    }
  }

  if (sent) return <div className="auth-success"><strong>{t("checkEmail")}</strong><p>{t("verificationSent")}</p></div>;

  return (
    <form className="auth-form" onSubmit={submit}>
      {googleEnabled ? <><button className="google-button" disabled={loading !== null} type="button" onClick={signUpWithGoogle}><span>G</span>{loading === "google" ? t("googleRedirect") : t("googleSignUp")}</button><div className="auth-divider"><span>{t("or")}</span></div></> : null}
      <label>{common("name")}<input name="name" autoComplete="name" required maxLength={100} /></label>
      <label>{common("email")}<input name="email" type="email" autoComplete="email" required /></label>
      <label>{common("password")}<input name="password" type="password" autoComplete="new-password" required minLength={10} /><small>{t("passwordHint")}</small></label>
      <label>{t("passwordConfirm")}<input name="passwordConfirm" type="password" autoComplete="new-password" required minLength={10} /></label>
      {visibleError ? <p className="auth-error" role="alert">{visibleError}</p> : null}
      <button className="auth-submit" disabled={loading !== null} type="submit">{loading === "email" ? t("creating") : t("createAccount")}</button>
    </form>
  );
}
