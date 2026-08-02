"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Save } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

export type ManagedUser = { id: string; name: string; email: string; role: "user" | "admin"; accessLevel: "read" | "edit"; approvalStatus: "pending" | "approved" | "rejected" | "suspended"; registrationMethod: "password" | "google"; registrationRequestId: string | null; createdAt: string; protected: boolean };

export function UserManagementTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [users, setUsers] = useState(initialUsers); const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState("");
  const update = (id: string, changes: Partial<ManagedUser>) => setUsers((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  const save = async (item: ManagedUser) => {
    setSaving(item.id); setMessage("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: item.role, accessLevel: item.accessLevel, approvalStatus: item.approvalStatus }) });
    const body = await response.json().catch(() => null);
    setMessage(response.ok ? t("changesSaved", { email: item.email }) : body?.error ?? t("saveFailed")); setSaving(null);
  };
  return <><div className="users-table" role="table">
    <div className="users-table__head" role="row"><span>{t("user")}</span><span>{t("role")}</span><span>{t("accessLevel")}</span><span>{t("status")}</span><span>{t("registration")}</span><span /></div>
    {users.map((item) => {
      const awaitingDecision = item.approvalStatus === "pending";
      const locked = item.protected || item.approvalStatus === "rejected";
      return <div className="users-table__row" role="row" data-awaiting-decision={awaitingDecision} key={item.id}>
        <div><strong>{item.name}</strong><span>{item.email}</span></div>
        <label><span className="mobile-field-label">{t("role")}</span><select aria-label={`${t("role")} ${item.email}`} value={item.role} disabled={locked} onChange={(event) => { const role = event.target.value as ManagedUser["role"]; update(item.id, { role, accessLevel: role === "admin" ? "edit" : item.accessLevel }); }}><option value="user">{t("user")}</option><option value="admin">{t("administrator")}</option></select></label>
        <label><span className="mobile-field-label">{t("accessLevel")}</span><select aria-label={`${t("accessLevel")} ${item.email}`} value={item.accessLevel} disabled={locked || item.role === "admin"} title={item.role === "admin" ? t("adminFullAccess") : undefined} onChange={(event) => update(item.id, { accessLevel: event.target.value as ManagedUser["accessLevel"] })}><option value="read">{t("readOnly")}</option><option value="edit">{t("editing")}</option></select></label>
        <label><span className="mobile-field-label">{t("status")}</span><select aria-label={`${t("status")} ${item.email}`} value={item.approvalStatus} disabled={locked || awaitingDecision} title={awaitingDecision ? t("reviewHint") : undefined} onChange={(event) => update(item.id, { approvalStatus: event.target.value as ManagedUser["approvalStatus"] })}>{item.approvalStatus === "pending" ? <option value="pending">{t("awaiting")}</option> : null}{item.approvalStatus === "rejected" ? <option value="rejected">{t("rejected")}</option> : null}<option value="approved">{t("active")}</option><option value="suspended">{t("suspended")}</option></select></label>
        <div className="user-meta"><span>{item.registrationMethod === "google" ? "Google" : "Email"}</span><time>{format.dateTime(new Date(item.createdAt), { dateStyle: "medium" })}</time></div>
        <div className="user-actions"><button className="icon-button" type="button" disabled={locked || saving === item.id} onClick={() => save(item)} title={item.protected ? t("protectedAdmin") : t("saveRights")} aria-label={t("saveUser", { email: item.email })}><Save size={18} /></button>{item.approvalStatus === "pending" && item.registrationRequestId ? <Link className="icon-button" href={`/admin/registrations/${item.registrationRequestId}`} title={t("reviewRequest")} aria-label={t("reviewUserRequest", { email: item.email })}><ClipboardCheck size={18} /></Link> : null}</div>
      </div>;
    })}
  </div>{message ? <p className="admin-message" role="status">{message}</p> : null}</>;
}
