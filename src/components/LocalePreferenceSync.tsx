"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { localeCookieName, type AppLocale } from "@/i18n/config";

export function LocalePreferenceSync({ preferredLocale }: { preferredLocale?: AppLocale }) {
  const router = useRouter();

  useEffect(() => {
    if (!preferredLocale || document.cookie.split(";").some((item) => item.trim().startsWith(`${localeCookieName}=`))) return;
    void fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: preferredLocale }) }).then((response) => {
      if (response.ok) router.refresh();
    }).catch(() => undefined);
  }, [preferredLocale, router]);

  return null;
}
