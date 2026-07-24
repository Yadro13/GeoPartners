"use client";

import { useEffect } from "react";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import "./globals.css";

export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("ui_global_error", { name: error.name, digest: error.digest ?? null });
  }, [error]);

  return <html lang="uk"><body><main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <TriangleAlert className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">Системна помилка</p>
    <h1>GeoPartners тимчасово недоступний</h1>
    <p>Повторіть завантаження. Якщо помилка зберігається, передайте адміністратору код нижче.</p>
    <div className="system-state__actions">
      <button type="button" onClick={unstable_retry}><RotateCcw size={17} />Повторити завантаження</button>
      <button type="button" data-variant="secondary" onClick={() => window.location.assign("/")}><House size={17} />Відкрити початкову сторінку</button>
    </div>
    {error.digest ? <small>Код помилки: {error.digest}</small> : null}
  </main></body></html>;
}
