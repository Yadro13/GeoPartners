"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
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
    if (newPassword.length < 10) return setError("Пароль має містити щонайменше 10 символів.");
    if (newPassword !== confirmation) return setError("Пароль і підтвердження не збігаються.");
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) throw new Error(result.error.message ?? "Password reset failed.");
      setComplete(true);
    } catch {
      setError("Посилання недійсне або вже прострочене. Запросіть нове посилання.");
    } finally {
      setLoading(false);
    }
  }

  if (complete) return <div className="auth-success" role="status"><CheckCircle2 size={24} /><strong>Пароль змінено</strong><p>Тепер можна увійти з новим паролем.</p><Link href="/sign-in">Перейти до входу</Link></div>;
  if (invalid || !token) return <div className="auth-error" role="alert">Посилання недійсне або вже прострочене. <Link href="/forgot-password">Запросити нове посилання</Link>.</div>;

  return <form className="auth-form" onSubmit={submit}>
    <label>Новий пароль<div className="password-field"><input name="newPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required autoFocus /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Приховати новий пароль" : "Показати новий пароль"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small>Щонайменше 10 символів</small></label>
    <label>Повторіть пароль<div className="password-field"><input name="confirmation" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required /><button type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? "Приховати підтвердження пароля" : "Показати підтвердження пароля"}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={loading} type="submit">{loading ? "Збереження…" : "Встановити новий пароль"}</button>
  </form>;
}
