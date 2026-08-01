import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "./auth.css";

export async function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-toolbar"><Link className="auth-brand" href="/"><span className="brand-mark">GP</span><strong>GeoPartners</strong></Link><LanguageSwitcher compact /></div>
        <div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <aside className="auth-map" aria-hidden="true">
        <div className="auth-map__grid" />
        <div className="auth-map__plot auth-map__plot--one" />
        <div className="auth-map__plot auth-map__plot--two" />
        <div className="auth-map__label">{t("mapLabel")}</div>
      </aside>
    </main>
  );
}
