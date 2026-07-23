"use client";

import { useState } from "react";
import { Save } from "lucide-react";

type ManagedUser = { id: string; name: string; email: string; role: "user" | "admin"; approvalStatus: "pending" | "approved" | "rejected" | "suspended"; registrationMethod: "password" | "google"; createdAt: string; protected: boolean };

export function UserManagementTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers); const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState("");
  const update = (id: string, changes: Partial<ManagedUser>) => setUsers((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  const save = async (item: ManagedUser) => {
    setSaving(item.id); setMessage("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: item.role, approvalStatus: item.approvalStatus }) });
    const body = await response.json().catch(() => null);
    setMessage(response.ok ? `Зміни для ${item.email} збережено.` : body?.error ?? "Не вдалося зберегти зміни."); setSaving(null);
  };
  return <><div className="users-table" role="table"><div className="users-table__head" role="row"><span>Користувач</span><span>Роль</span><span>Доступ</span><span>Реєстрація</span><span /></div>{users.map((item) => <div className="users-table__row" role="row" key={item.id}><div><strong>{item.name}</strong><span>{item.email}</span></div><label><span className="mobile-field-label">Роль</span><select value={item.role} disabled={item.protected} onChange={(event) => update(item.id, { role: event.target.value as ManagedUser["role"] })}><option value="user">Користувач</option><option value="admin">Адміністратор</option></select></label><label><span className="mobile-field-label">Доступ</span><select value={item.approvalStatus} disabled={item.protected || item.approvalStatus === "pending" || item.approvalStatus === "rejected"} onChange={(event) => update(item.id, { approvalStatus: event.target.value as ManagedUser["approvalStatus"] })}>{item.approvalStatus === "pending" ? <option value="pending">Очікує рішення</option> : null}{item.approvalStatus === "rejected" ? <option value="rejected">Відхилено</option> : null}<option value="approved">Активний</option><option value="suspended">Призупинений</option></select></label><div className="user-meta"><span>{item.registrationMethod === "google" ? "Google" : "Email"}</span><time>{new Date(item.createdAt).toLocaleDateString("uk-UA")}</time></div><button className="icon-button" type="button" disabled={item.protected || saving === item.id} onClick={() => save(item)} title={item.protected ? "Захищений адміністратор" : "Зберегти"} aria-label={`Зберегти ${item.email}`}><Save size={18} /></button></div>)}</div>{message ? <p className="admin-message" role="status">{message}</p> : null}</>;
}
