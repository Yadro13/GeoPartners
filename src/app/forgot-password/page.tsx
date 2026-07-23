import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return <AuthShell title="Відновлення пароля" subtitle="Вкажіть email, використаний під час реєстрації" footer={<Link href="/sign-in">Повернутися до входу</Link>}><ForgotPasswordForm /></AuthShell>;
}
