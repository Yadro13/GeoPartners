"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const t = useTranslations("system");
  useEffect(() => {
    console.error("ui_route_error", { name: error.name, digest: error.digest ?? null });
  }, [error]);

  return <main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <TriangleAlert className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">{t("temporaryError")}</p>
    <h1>{t("pageLoadFailed")}</h1>
    <p>{t("retryHint")}</p>
    <div className="system-state__actions">
      <button type="button" onClick={unstable_retry}><RotateCcw size={17} />{t("retry")}</button>
      <Link href="/"><House size={17} />{t("workspace")}</Link>
    </div>
    {error.digest ? <small>{t("errorCode", { code: error.digest })}</small> : null}
  </main>;
}
