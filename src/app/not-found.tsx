import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("system");
  return <main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <MapPinOff className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">{t("notFoundEyebrow")}</p>
    <h1>{t("notFound")}</h1>
    <p>{t("notFoundHint")}</p>
    <div className="system-state__actions">
      <Link href="/"><ArrowLeft size={17} />{t("backToMap")}</Link>
    </div>
  </main>;
}
