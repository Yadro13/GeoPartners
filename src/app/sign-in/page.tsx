import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";

export default async function SignInPage() {
  await connection();
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <AuthShell title="Вхід" subtitle="Увійдіть до робочого простору GeoPartners" footer={<>Ще немає облікового запису? <Link href="/sign-up">Зареєструватися</Link></>}><Suspense><SignInForm googleEnabled={googleEnabled} /></Suspense></AuthShell>;
}
