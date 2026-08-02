"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { UserManagementTable, type ManagedUser } from "./UserManagementTable";
import "./user-management.css";

export function UserManagementPanel({ users }: { users: ManagedUser[] }) {
  const t = useTranslations("admin");

  return <section className="workspace-page user-management-page">
    <header className="workspace-page__header">
      <div><span className="eyebrow">{t("administration")}</span><h1>{t("users")}</h1></div>
      <Link className="command-button" href="/admin/registrations"><ClipboardList size={17} />{t("requestHistory")}</Link>
    </header>
    <UserManagementTable initialUsers={users} />
  </section>;
}
