"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { oauthErrorKey } from "@/lib/auth-errors";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = searchParams.get("callbackURL") ?? "/";
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const oauthKey = oauthErrorKey(searchParams.get("error"));
  const visibleError = error ?? (oauthKey ? t(oauthKey) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading("email");
    setError(null);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL,
    });
    setLoading(null);
    if (result.error) return setError(result.error.status === 403 ? t("emailVerificationRequired") : t("invalidCredentials"));
    router.push(callbackURL);
    router.refresh();
  }

  async function signInWithGoogle() {
    setLoading("google");
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: "/pending",
      errorCallbackURL: `/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`,
    });
    if (result.error) {
      setLoading(null);
      setError(t("googleStartFailed"));
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {googleEnabled ? <><button className="google-button" disabled={loading !== null} type="button" onClick={signInWithGoogle}><span>G</span>{loading === "google" ? t("googleRedirect") : t("googleSignIn")}</button><div className="auth-divider"><span>{t("or")}</span></div></> : null}
      <label>{common("email")}<input name="email" type="email" autoComplete="email" required /></label>
      <label>{common("password")}<div className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("hidePassword") : t("showPassword")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
      <Link className="auth-inline-link" href="/forgot-password">{t("forgotPassword")}</Link>
      {visibleError ? <p className="auth-error" role="alert">{visibleError}</p> : null}
      <button className="auth-submit" disabled={loading !== null} type="submit">{loading === "email" ? t("signingIn") : t("signIn")}</button>
    </form>
  );
}
