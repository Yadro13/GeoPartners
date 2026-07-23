"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, Download, Eye, EyeOff, FileJson, FileSpreadsheet, FileText, KeyRound, Link2, LogOut, Plus, Printer, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { CategoryDefinition } from "@/data/demo";
import { exportReportDocx, exportReportPdf, printReport, summarizePlots } from "@/lib/report-export";
import type { BaseMapId, PlotFeature, WorkspaceActions, WorkspaceUser } from "./types";
import type { DataWorkspace } from "@/lib/data-workspace";

export function LayersPanel({ categories, baseMap, actions, canManage }: { categories: Record<string, CategoryDefinition>; baseMap: BaseMapId; actions: WorkspaceActions; canManage: boolean }) {
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">Відображення карти</span><h1>Шари</h1></div>{canManage ? <button className="command-button" type="button" onClick={actions.addCategory}><Plus size={17} />Категорія</button> : <span className="role-badge">Категорії захищено</span>}</header>
    <div className="settings-section"><h2>Підкладка</h2><div className="segmented-control" role="group" aria-label="Підкладка карти">{([['streets','Схема'],['light','Світла'],['satellite','Супутник']] as const).map(([id,label]) => <button key={id} data-active={baseMap === id} type="button" onClick={() => actions.setBaseMap(id)}>{label}</button>)}</div></div>
    <div className="settings-section"><h2>Категорії ділянок</h2><div className="category-settings">{Object.entries(categories).map(([id, category]) => <div className="category-setting" key={id}>
      <input aria-label={`Показувати ${category.name}`} type="checkbox" checked={category.visible} onChange={(event) => actions.toggleCategory(id, event.target.checked)} />
      <input aria-label={`Колір ${category.name}`} type="color" value={category.color} disabled={!canManage} onChange={(event) => actions.updateCategory(id, { color: event.target.value })} />
      <input aria-label="Назва категорії" value={category.name} disabled={!canManage || id === "default"} onChange={(event) => actions.updateCategory(id, { name: event.target.value })} />
      <button className="icon-button" disabled={!canManage || id === "default"} type="button" onClick={() => actions.removeCategory(id)} aria-label={`Видалити ${category.name}`}><Trash2 size={17} /></button>
    </div>)}</div></div>
  </section>;
}

export function ReportsPanel({ plots, categories, actions }: { plots: PlotFeature[]; categories: Record<string, CategoryDefinition>; actions: WorkspaceActions }) {
  const summary = useMemo(() => summarizePlots(plots, categories), [categories, plots]);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const run = async (type: "pdf" | "docx") => { setBusy(type); try { await (type === "pdf" ? exportReportPdf(summary) : exportReportDocx(summary)); } finally { setBusy(null); } };
  return <section className="workspace-page report-page"><header className="workspace-page__header"><div><span className="eyebrow">Поточний набір</span><h1>Зведений звіт</h1></div><div className="page-actions"><button className="command-button" type="button" onClick={actions.exportCsv}><FileSpreadsheet size={17} />CSV</button><button className="command-button" type="button" onClick={actions.exportGeoJson}><FileJson size={17} />GeoJSON</button></div></header>
    <div className="report-metrics"><article><strong>{summary.count}</strong><span>ділянок у видимих шарах</span></article><article><strong>{summary.totalArea.toLocaleString("uk-UA", { maximumFractionDigits: 4 })}</strong><span>гектарів загалом</span></article><article><strong>{summary.byCategory.length}</strong><span>активних категорій</span></article></div>
    <div className="report-layout"><section><h2>За категоріями</h2><div className="report-category-list">{summary.byCategory.map((item) => <div key={item.id}><span className="category-line__swatch" style={{ background: item.color }} /><strong>{item.name}</strong><span>{item.count} шт.</span><span>{item.area.toLocaleString("uk-UA", { maximumFractionDigits: 4 })} га</span></div>)}</div></section>
      <aside className="report-export"><h2>Зберегти звіт</h2><p>Базовий зведений звіт. Його склад буде розширено після отримання окремого ТЗ.</p><button className="command-button command-button--primary" disabled={Boolean(busy)} type="button" onClick={() => run("pdf")}><Download size={17} />{busy === "pdf" ? "Формування…" : "Завантажити PDF"}</button><button className="command-button" disabled={Boolean(busy)} type="button" onClick={() => run("docx")}><FileText size={17} />{busy === "docx" ? "Формування…" : "Завантажити DOCX"}</button><button className="command-button" type="button" onClick={printReport}><Printer size={17} />Друкувати</button></aside>
    </div>
  </section>;
}

export function UsersPanel({ isAdmin }: { isAdmin: boolean }) {
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">Доступ до системи</span><h1>Користувачі</h1></div></header>{isAdmin ? <div className="access-actions"><Link className="command-button command-button--primary" href="/admin/users"><UserRound size={18} />Керувати користувачами</Link><Link className="command-button" href="/admin/registrations"><ShieldCheck size={18} />Заявки на реєстрацію</Link><p>Змінюйте ролі, призупиняйте доступ і розглядайте нові заявки.</p></div> : <div className="empty-state"><ShieldCheck size={26} /><h2>Розділ адміністратора</h2><p>Керування користувачами доступне лише адміністратору.</p></div>}</section>;
}

type ProfileMessage = { kind: "success" | "error"; text: string } | null;

function PasswordField({ name, label, autoComplete }: { name: string; label: string; autoComplete: "current-password" | "new-password" }) {
  const [visible, setVisible] = useState(false);
  const visibilityLabel = visible ? `Приховати: ${label.toLocaleLowerCase("uk-UA")}` : `Показати: ${label.toLocaleLowerCase("uk-UA")}`;

  return <label>{label}<div className="profile-password-field"><input name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={autoComplete === "new-password" ? 10 : undefined} maxLength={128} required /><button type="button" title={visibilityLabel} aria-label={visibilityLabel} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

function passwordErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "INVALID_PASSWORD") return "Поточний пароль введено неправильно.";
  if (error.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return "Для цього облікового запису вхід за паролем не налаштовано.";
  if (error.code === "PASSWORD_TOO_SHORT") return "Новий пароль має містити щонайменше 10 символів.";
  if (error.code === "PASSWORD_TOO_LONG") return "Новий пароль не може містити більше 128 символів.";
  return error.message || "Не вдалося змінити пароль. Спробуйте ще раз.";
}

export function ProfilePanel({ user, googleEnabled, preview, workspace, testWorkspaceEnabled, actions }: { user: WorkspaceUser; googleEnabled: boolean; preview: boolean; workspace: DataWorkspace; testWorkspaceEnabled: boolean; actions: WorkspaceActions }) {
  const [message, setMessage] = useState<ProfileMessage>(null);
  const [busy, setBusy] = useState<"name" | "password" | "google" | null>(null);
  const [providers, setProviders] = useState<string[]>(preview ? ["credential"] : []);
  const [accountsLoaded, setAccountsLoaded] = useState(preview);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void authClient.listAccounts().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage({ kind: "error", text: "Не вдалося перевірити підключені способи входу." });
      setProviders(data?.map((account) => account.providerId) ?? []);
      setAccountsLoaded(true);
    });
    return () => { active = false; };
  }, [preview]);

  const updateName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("name"); setMessage(null);
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (preview) { setMessage({ kind: "success", text: "Ім’я збережено у режимі перегляду." }); setBusy(null); return; }
    const { error } = await authClient.updateUser({ name });
    setMessage(error ? { kind: "error", text: error.message ?? "Не вдалося оновити ім’я." } : { kind: "success", text: "Ім’я оновлено." }); setBusy(null);
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("password"); setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const newPasswordConfirm = String(data.get("newPasswordConfirm") ?? "");
    if (newPassword.length < 10) { setMessage({ kind: "error", text: "Новий пароль має містити щонайменше 10 символів." }); setBusy(null); return; }
    if (newPassword === currentPassword) { setMessage({ kind: "error", text: "Новий пароль має відрізнятися від поточного." }); setBusy(null); return; }
    if (newPassword !== newPasswordConfirm) { setMessage({ kind: "error", text: "Новий пароль і підтвердження не збігаються." }); setBusy(null); return; }
    if (preview) { setMessage({ kind: "success", text: "Пароль перевірено у режимі перегляду." }); setBusy(null); form.reset(); return; }
    try {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (error) { setMessage({ kind: "error", text: passwordErrorMessage(error) }); return; }
      form.reset();
      setMessage({ kind: "success", text: "Пароль змінено. Інші активні сесії завершено." });
    } catch {
      setMessage({ kind: "error", text: "Не вдалося змінити пароль. Перевірте з’єднання та спробуйте ще раз." });
    } finally {
      setBusy(null);
    }
  };
  const connectGoogle = async () => {
    setBusy("google"); setMessage(null);
    if (preview) { setProviders((current) => [...new Set([...current, "google"])]); setMessage({ kind: "success", text: "Google підключено у режимі перегляду." }); setBusy(null); return; }
    const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/" });
    if (error) { setMessage({ kind: "error", text: error.message ?? "Не вдалося підключити Google." }); setBusy(null); }
  };
  const signOut = async () => { if (preview) return; await authClient.signOut(); window.location.href = "/sign-in"; };
  const googleLinked = providers.includes("google");
  const passwordAvailable = preview || providers.includes("credential");
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">Обліковий запис</span><h1>Профіль</h1></div><span className="role-badge">{user.role === "admin" ? "Адміністратор" : "Користувач"}</span></header>
    <div className="profile-layout"><section className="profile-summary"><span className="profile-avatar"><UserRound size={26} /></span><strong>{user.name}</strong><span>{user.email}</span>{user.role === "admin" ? <Link className="command-button" href="/admin/users">Користувачі</Link> : null}</section><div className="profile-forms"><form onSubmit={updateName}><h2>Ім’я в системі</h2><label>Ім’я<input name="name" defaultValue={user.name} required maxLength={100} /></label><button className="command-button" disabled={busy !== null} type="submit"><Save size={17} />Зберегти ім’я</button></form>{passwordAvailable ? <form onSubmit={changePassword}><h2>Змінити пароль</h2><PasswordField name="currentPassword" label="Поточний пароль" autoComplete="current-password" /><PasswordField name="newPassword" label="Новий пароль" autoComplete="new-password" /><PasswordField name="newPasswordConfirm" label="Повторіть новий пароль" autoComplete="new-password" /><button className="command-button" disabled={busy !== null} type="submit"><KeyRound size={17} />{busy === "password" ? "Збереження…" : "Змінити пароль"}</button></form> : accountsLoaded ? <section className="profile-connection"><div><span className="profile-connection__icon"><KeyRound size={19} /></span><span><strong>Пароль</strong><small>Вхід налаштовано через зовнішній обліковий запис</small></span></div></section> : null}{googleEnabled && user.role !== "admin" ? <section className="profile-connection"><div><span className="profile-connection__icon">{googleLinked ? <CircleCheck size={19} /> : <Link2 size={19} />}</span><span><strong>Google</strong><small>{googleLinked ? "Підключено" : "Не підключено"}</small></span></div>{googleLinked ? <span className="role-badge">Активно</span> : <button className="command-button" disabled={busy !== null || !accountsLoaded} type="button" onClick={connectGoogle}><Link2 size={17} />Підключити</button>}</section> : null}{user.role === "admin" ? <div className="profile-mobile-workspace-settings"><WorkspaceAdminSettings actions={actions} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} /></div> : null}{message ? <p className="form-message" data-kind={message.kind} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}<button className="danger-button" type="button" onClick={signOut}><LogOut size={17} />Вийти з облікового запису</button></div></div>
  </section>;
}

export function SettingsPanel({ actions, canImport, workspace, testWorkspaceEnabled, canManageWorkspaces }: { actions: WorkspaceActions; canImport: boolean; workspace: DataWorkspace; testWorkspaceEnabled: boolean; canManageWorkspaces: boolean }) {
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">Обмін даними</span><h1>Налаштування</h1></div></header><div className="settings-actions">{canImport ? <button className="command-button command-button--primary" type="button" onClick={actions.openImport}><FileJson size={18} />Імпортувати дані</button> : null}<button className="command-button" type="button" onClick={actions.exportGeoJson}><Download size={18} />Експортувати GeoJSON</button><button className="command-button" type="button" onClick={actions.exportCsv}><FileSpreadsheet size={18} />Експортувати CSV</button></div>{canManageWorkspaces ? <WorkspaceAdminSettings actions={actions} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} /> : null}</section>;
}

function WorkspaceAdminSettings({ actions, workspace, testWorkspaceEnabled }: { actions: WorkspaceActions; workspace: DataWorkspace; testWorkspaceEnabled: boolean }) {
  return <section className="workspace-admin-settings" data-workspace={workspace}><div><span className="eyebrow">Області даних</span><h2>Тестова база</h2></div><label className="toggle-setting"><span><strong>Показувати тестову базу</strong><small>{testWorkspaceEnabled ? "Перемикач доступний усім користувачам" : "Усі користувачі працюють лише з робочою базою"}</small></span><input type="checkbox" role="switch" checked={testWorkspaceEnabled} onChange={(event) => void actions.setTestWorkspaceEnabled(event.target.checked)} /><i aria-hidden="true" /></label>{testWorkspaceEnabled ? <button className="danger-button" type="button" onClick={() => void actions.clearSandbox()}><Trash2 size={17} />Очистити тестову базу</button> : null}</section>;
}
