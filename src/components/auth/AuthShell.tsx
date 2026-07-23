import Link from "next/link";
import type { ReactNode } from "react";
import "./auth.css";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link className="auth-brand" href="/"><span className="brand-mark">GP</span><strong>GeoPartners</strong></Link>
        <div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <aside className="auth-map" aria-hidden="true">
        <div className="auth-map__grid" />
        <div className="auth-map__plot auth-map__plot--one" />
        <div className="auth-map__plot auth-map__plot--two" />
        <div className="auth-map__label">Система керування геоданими</div>
      </aside>
    </main>
  );
}
