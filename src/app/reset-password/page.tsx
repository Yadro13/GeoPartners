import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getTranslations } from "next-intl/server";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const t = await getTranslations("auth");
  return <AuthShell title={t("newPasswordTitle")} subtitle={t("newPasswordSubtitle")} footer={<Link href="/sign-in">{t("backToSignIn")}</Link>}><ResetPasswordForm token={token ?? null} invalid={Boolean(error)} /></AuthShell>;
}
