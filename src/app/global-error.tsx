"use client";

import { useEffect, useState } from "react";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import "./globals.css";
import type { AppLocale } from "@/i18n/config";

export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const [locale] = useState<AppLocale>(() => {
    if (typeof document === "undefined") return "uk";
    const cookieLocale = document.cookie.match(/(?:^|;\s*)GP_LOCALE=(uk|de|en)(?:;|$)/)?.[1];
    if (cookieLocale === "uk" || cookieLocale === "de" || cookieLocale === "en") return cookieLocale;
    return navigator.language.split("-")[0] === "de" ? "de" : navigator.language.split("-")[0] === "en" ? "en" : "uk";
  });
  const labels = globalErrorLabels[locale];
  useEffect(() => {
    console.error("ui_global_error", { name: error.name, digest: error.digest ?? null });
  }, [error]);

  return <html lang={locale}><body><main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <TriangleAlert className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">{labels.eyebrow}</p>
    <h1>{labels.title}</h1>
    <p>{labels.hint}</p>
    <div className="system-state__actions">
      <button type="button" onClick={unstable_retry}><RotateCcw size={17} />{labels.retry}</button>
      <button type="button" data-variant="secondary" onClick={() => window.location.assign("/")}><House size={17} />{labels.home}</button>
    </div>
    {error.digest ? <small>{labels.code}: {error.digest}</small> : null}
  </main></body></html>;
}

const globalErrorLabels: Record<AppLocale, { eyebrow: string; title: string; hint: string; retry: string; home: string; code: string }> = {
  uk: { eyebrow: "Системна помилка", title: "GeoPartners тимчасово недоступний", hint: "Повторіть завантаження. Якщо помилка зберігається, передайте адміністратору код нижче.", retry: "Повторити завантаження", home: "Відкрити початкову сторінку", code: "Код помилки" },
  de: { eyebrow: "Systemfehler", title: "GeoPartners ist vorübergehend nicht verfügbar", hint: "Laden Sie die Seite erneut. Wenn der Fehler weiterhin auftritt, senden Sie dem Administrator den unten stehenden Code.", retry: "Neu laden", home: "Startseite öffnen", code: "Fehlercode" },
  en: { eyebrow: "System error", title: "GeoPartners is temporarily unavailable", hint: "Reload the page. If the error persists, send the code below to the administrator.", retry: "Reload", home: "Open home page", code: "Error code" },
};
