import Link from "next/link";
import { FileBarChart, History, Layers3, Map, Settings, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

const navigation = [
  { id: "map", href: "/?section=map", icon: Map },
  { id: "layers", href: "/?section=layers", icon: Layers3 },
  { id: "reports", href: "/?section=reports", icon: FileBarChart },
  { id: "history", href: "/?section=history", icon: History },
  { id: "users", href: "/admin/users", icon: Users },
] as const;

export async function AdminNavigation({ active = "users" }: { active?: (typeof navigation)[number]["id"] | "settings" }) {
  const t = await getTranslations("workspace");
  return <nav className="admin-rail" aria-label={t("mainNavigation")}>
    {navigation.map(({ id, href, icon: Icon }) => <Link className="admin-rail__link" data-active={active === id} href={href} key={id} title={t(id)} aria-label={t(id)} aria-current={active === id ? "page" : undefined}><Icon size={21} /></Link>)}
    <span className="admin-rail__spacer" />
    <Link className="admin-rail__link" data-active={active === "settings"} href="/?section=settings" title={t("settings")} aria-label={t("settings")} aria-current={active === "settings" ? "page" : undefined}><Settings size={21} /></Link>
  </nav>;
}
