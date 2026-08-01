import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getTranslations } from "next-intl/server";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return <AuthShell title={t("forgotTitle")} subtitle={t("forgotSubtitle")} footer={<Link href="/sign-in">{t("backToSignIn")}</Link>}><ForgotPasswordForm /></AuthShell>;
}
