"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAppLocale, type AppLocale } from "@/i18n/config";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("language");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const changeLocale = async (nextLocale: string) => {
    if (!isAppLocale(nextLocale) || nextLocale === locale) return;
    setBusy(true);
    const response = await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: nextLocale }) });
    if (response.ok) router.refresh();
    setBusy(false);
  };

  return <label className="language-switcher" data-compact={compact}>
    <Languages size={17} aria-hidden="true" />
    <span className="sr-only">{t("label")}</span>
    <select aria-label={t("label")} value={locale} disabled={busy} onChange={(event) => void changeLocale(event.target.value)}>
      <option value="uk">{compact ? "UA" : "Українська"}</option>
      <option value="de">{compact ? "DE" : "Deutsch"}</option>
      <option value="en">{compact ? "EN" : "English"}</option>
    </select>
  </label>;
}
