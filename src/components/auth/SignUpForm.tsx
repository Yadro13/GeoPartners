"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { oauthErrorMessage } from "@/lib/auth-errors";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const visibleError = error ?? oauthErrorMessage(searchParams.get("error"));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("passwordConfirm"))) return setError("Паролі не збігаються.");
    setLoading("email");
    setError(null);
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password,
      callbackURL: "/pending",
    });
    setLoading(null);
    if (result.error) return setError("Не вдалося створити обліковий запис. Перевірте введені дані.");
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
      setError("Не вдалося розпочати реєстрацію через Google. Спробуйте ще раз.");
    }
  }

  if (sent) return <div className="auth-success"><strong>Перевірте пошту</strong><p>Ми надіслали посилання для підтвердження email. Після цього заявка надійде адміністратору.</p></div>;

  return (
    <form className="auth-form" onSubmit={submit}>
      {googleEnabled ? <><button className="google-button" disabled={loading !== null} type="button" onClick={signUpWithGoogle}><span>G</span>{loading === "google" ? "Перехід до Google…" : "Зареєструватися через Google"}</button><div className="auth-divider"><span>або</span></div></> : null}
      <label>Ім’я<input name="name" autoComplete="name" required maxLength={100} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Пароль<input name="password" type="password" autoComplete="new-password" required minLength={10} /><small>Щонайменше 10 символів</small></label>
      <label>Повторіть пароль<input name="passwordConfirm" type="password" autoComplete="new-password" required minLength={10} /></label>
      {visibleError ? <p className="auth-error" role="alert">{visibleError}</p> : null}
      <button className="auth-submit" disabled={loading !== null} type="submit">{loading === "email" ? "Створення…" : "Створити обліковий запис"}</button>
    </form>
  );
}
