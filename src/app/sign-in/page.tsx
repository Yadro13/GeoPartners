import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";
import { getTranslations } from "next-intl/server";

export default async function SignInPage() {
  await connection();
  const t = await getTranslations("auth");
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <AuthShell title={t("signInTitle")} subtitle={t("signInSubtitle")} footer={<>{t("noAccount")} <Link href="/sign-up">{t("register")}</Link></>}><Suspense><SignInForm googleEnabled={googleEnabled} /></Suspense></AuthShell>;
}
