import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { getTranslations } from "next-intl/server";

export default async function SignUpPage() {
  await connection();
  const t = await getTranslations("auth");
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <AuthShell title={t("signUpTitle")} subtitle={t("signUpSubtitle")} footer={<>{t("alreadyRegistered")} <Link href="/sign-in">{t("signIn")}</Link></>}><Suspense><SignUpForm googleEnabled={googleEnabled} /></Suspense></AuthShell>;
}
