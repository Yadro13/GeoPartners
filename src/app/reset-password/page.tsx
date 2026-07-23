import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <AuthShell title="Новий пароль" subtitle="Встановіть новий пароль для облікового запису" footer={<Link href="/sign-in">Повернутися до входу</Link>}><ResetPasswordForm token={token ?? null} invalid={Boolean(error)} /></AuthShell>;
}
