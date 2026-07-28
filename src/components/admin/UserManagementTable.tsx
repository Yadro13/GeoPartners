"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Save } from "lucide-react";

type ManagedUser = { id: string; name: string; email: string; role: "user" | "admin"; accessLevel: "read" | "edit"; approvalStatus: "pending" | "approved" | "rejected" | "suspended"; registrationMethod: "password" | "google"; registrationRequestId: string | null; createdAt: string; protected: boolean };

export function UserManagementTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers); const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState("");
  const update = (id: string, changes: Partial<ManagedUser>) => setUsers((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  const save = async (item: ManagedUser) => {
    setSaving(item.id); setMessage("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: item.role, accessLevel: item.accessLevel, approvalStatus: item.approvalStatus }) });
    const body = await response.json().catch(() => null);
    setMessage(response.ok ? `Зміни для ${item.email} збережено.` : body?.error ?? "Не вдалося зберегти зміни."); setSaving(null);
  };
  return <><div className="users-table" role="table">
    <div className="users-table__head" role="row"><span>Користувач</span><span>Роль</span><span>Рівень доступу</span><span>Статус</span><span>Реєстрація</span><span /></div>
    {users.map((item) => {
      const awaitingDecision = item.approvalStatus === "pending";
      const locked = item.protected || item.approvalStatus === "rejected";
      return <div className="users-table__row" role="row" data-awaiting-decision={awaitingDecision} key={item.id}>
        <div><strong>{item.name}</strong><span>{item.email}</span></div>
        <label><span className="mobile-field-label">Роль</span><select aria-label={`Роль ${item.email}`} value={item.role} disabled={locked} onChange={(event) => { const role = event.target.value as ManagedUser["role"]; update(item.id, { role, accessLevel: role === "admin" ? "edit" : item.accessLevel }); }}><option value="user">Користувач</option><option value="admin">Адміністратор</option></select></label>
        <label><span className="mobile-field-label">Рівень доступу</span><select aria-label={`Рівень доступу ${item.email}`} value={item.accessLevel} disabled={locked || item.role === "admin"} title={item.role === "admin" ? "Адміністратор завжди має повний доступ" : undefined} onChange={(event) => update(item.id, { accessLevel: event.target.value as ManagedUser["accessLevel"] })}><option value="read">Тільки читання</option><option value="edit">Редагування</option></select></label>
        <label><span className="mobile-field-label">Статус</span><select aria-label={`Статус ${item.email}`} value={item.approvalStatus} disabled={locked || awaitingDecision} title={awaitingDecision ? "Підтвердіть або відхиліть заявку у формі розгляду" : undefined} onChange={(event) => update(item.id, { approvalStatus: event.target.value as ManagedUser["approvalStatus"] })}>{item.approvalStatus === "pending" ? <option value="pending">Очікує рішення</option> : null}{item.approvalStatus === "rejected" ? <option value="rejected">Відхилено</option> : null}<option value="approved">Активний</option><option value="suspended">Призупинений</option></select></label>
        <div className="user-meta"><span>{item.registrationMethod === "google" ? "Google" : "Email"}</span><time>{new Date(item.createdAt).toLocaleDateString("uk-UA")}</time></div>
        <div className="user-actions"><button className="icon-button" type="button" disabled={locked || saving === item.id} onClick={() => save(item)} title={item.protected ? "Захищений адміністратор" : "Зберегти роль і рівень доступу"} aria-label={`Зберегти ${item.email}`}><Save size={18} /></button>{item.approvalStatus === "pending" && item.registrationRequestId ? <Link className="icon-button" href={`/admin/registrations/${item.registrationRequestId}`} title="Розглянути заявку" aria-label={`Розглянути заявку ${item.email}`}><ClipboardCheck size={18} /></Link> : null}</div>
      </div>;
    })}
  </div>{message ? <p className="admin-message" role="status">{message}</p> : null}</>;
}
