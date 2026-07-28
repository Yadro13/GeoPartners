import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default async function SignUpPage() {
  await connection();
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <AuthShell title="Реєстрація" subtitle="Після перевірки email заявку підтвердить адміністратор" footer={<>Вже зареєстровані? <Link href="/sign-in">Увійти</Link></>}><Suspense><SignUpForm googleEnabled={googleEnabled} /></Suspense></AuthShell>;
}
