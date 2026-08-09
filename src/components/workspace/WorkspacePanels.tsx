"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CircleCheck, Coins, Download, Eye, EyeOff, FileJson, FileSpreadsheet, FileText, KeyRound, Link2, LogOut, Plus, Printer, Save, Trash2, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { CategoryDefinition } from "@/data/demo";
import { plotStatusScopes, statusesForScope, type PlotStatusDefinition, type PlotStatusScope } from "@/data/plot-statuses";
import type { ResultStatusProgress } from "@/lib/result-status-progress";
import { exportReportDocx, exportReportPdf, exportResultReportDocx, exportResultReportPdf, printReport, summarizePlots } from "@/lib/report-export";
import { buildStatusReportRows, exportResultReportXlsx, exportStatusReportXlsx } from "@/lib/status-report-export";
import { buildResultReportGroups } from "@/lib/result-report";
import type { BaseMapId, PlotFeature, WorkspaceActions, WorkspaceUser } from "./types";
import type { DataWorkspace } from "@/lib/data-workspace";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ReportViewSelector, StatusReport, type ReportView } from "./StatusReport";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export function LayersPanel({ categories, baseMap, actions, canManage }: { categories: Record<string, CategoryDefinition>; baseMap: BaseMapId; actions: WorkspaceActions; canManage: boolean }) {
  const t = useTranslations("panels");
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">{t("mapDisplay")}</span><h1>{t("layers")}</h1></div>{canManage ? <button className="command-button" type="button" onClick={actions.addCategory}><Plus size={17} />{t("category")}</button> : <span className="role-badge">{t("categoriesProtected")}</span>}</header>
    <div className="settings-section"><h2>{t("baseMap")}</h2><div className="segmented-control" role="group" aria-label={t("mapBaseLabel")}>{(["streets", "light", "satellite"] as const).map((id) => <button key={id} data-active={baseMap === id} type="button" onClick={() => actions.setBaseMap(id)}>{t(id)}</button>)}</div></div>
    <div className="settings-section"><div className="category-settings__header"><h2>{t("plotCategories")}</h2><span>{t("description")}</span></div><div className="category-settings">{Object.entries(categories).map(([id, category]) => <CategorySetting id={id} category={category} actions={actions} canManage={canManage} key={id} />)}</div></div>
  </section>;
}

function CategorySetting({ id, category, actions, canManage }: { id: string; category: CategoryDefinition; actions: WorkspaceActions; canManage: boolean }) {
  const t = useTranslations("panels");
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);

  const saveName = () => {
    const normalized = name.trim();
    if (!normalized) return setName(category.name);
    if (normalized !== category.name) actions.updateCategory(id, { name: normalized, description: description.trim() });
  };
  const saveDescription = () => {
    const normalized = description.trim();
    setDescription(normalized);
    if (normalized !== category.description) actions.updateCategory(id, { name: name.trim() || category.name, description: normalized });
  };

  return <div className="category-setting">
    <input aria-label={t("showCategory", { name: category.name })} type="checkbox" checked={category.visible} onChange={(event) => actions.toggleCategory(id, event.target.checked)} />
    <input aria-label={t("categoryColor", { name: category.name })} type="color" value={category.color} disabled={!canManage} onChange={(event) => actions.updateCategory(id, { color: event.target.value })} />
    <input aria-label={t("categoryName", { name: category.name })} value={name} disabled={!canManage} maxLength={120} onBlur={saveName} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    {canManage ? <textarea aria-label={t("categoryDescription", { name: category.name })} value={description} maxLength={500} rows={2} placeholder={t("descriptionPlaceholder")} onBlur={saveDescription} onChange={(event) => setDescription(event.target.value)} /> : <p className="category-setting__description" data-empty={!category.description}>{category.description || t("descriptionMissing")}</p>}
    <button className="icon-button" disabled={!canManage || Boolean(category.systemRole)} type="button" onClick={() => actions.removeCategory(id)} aria-label={t("deleteCategory", { name: category.name })}><Trash2 size={17} /></button>
  </div>;
}

export function ReportsPanel({ plots, categories, plotStatuses, resultStatusProgress, actions, canViewExpenses }: { plots: PlotFeature[]; categories: Record<string, CategoryDefinition>; plotStatuses: PlotStatusDefinition[]; resultStatusProgress: ResultStatusProgress[]; actions: WorkspaceActions; canViewExpenses: boolean }) {
  const t = useTranslations("panels");
  const format = useFormatter();
  const locale = useLocale();
  const summary = useMemo(() => summarizePlots(plots, categories), [categories, plots]);
  const statusRows = useMemo(() => buildStatusReportRows(plots, categories), [categories, plots]);
  const [reportView, setReportView] = useState<ReportView>("wtg");
  const resultType = reportView === "plots" ? null : reportView;
  const scopedStatuses = useMemo(() => statusesForScope(plotStatuses, resultType ?? "plots"), [plotStatuses, resultType]);
  const resultGroups = useMemo(() => resultType ? buildResultReportGroups(plots, categories, resultType, resultStatusProgress) : [], [categories, plots, resultStatusProgress, resultType]);
  const visibleStageCost = resultType ? resultGroups.reduce((sum, group) => sum + group.totalCost, 0) : summary.totalStageCost;
  const hasReportData = resultType ? resultGroups.length > 0 : statusRows.length > 0;
  const [busy, setBusy] = useState<"xlsx" | "pdf" | "docx" | null>(null);
  const run = async (type: "xlsx" | "pdf" | "docx") => {
    setBusy(type);
    try {
      if (type === "xlsx") { if (resultType) await exportResultReportXlsx(resultGroups, resultType, scopedStatuses, locale, categories, canViewExpenses); else await exportStatusReportXlsx(statusRows, scopedStatuses, locale, canViewExpenses); }
      else if (type === "pdf") { if (resultType) await exportResultReportPdf(resultGroups, resultType, locale, scopedStatuses, canViewExpenses); else await exportReportPdf(summary, locale, scopedStatuses, canViewExpenses); }
      else { if (resultType) await exportResultReportDocx(resultGroups, resultType, locale, scopedStatuses, canViewExpenses); else await exportReportDocx(summary, locale, scopedStatuses, canViewExpenses); }
    } finally { setBusy(null); }
  };
  return <section className="workspace-page report-page"><header className="workspace-page__header report-page__header"><div><span className="eyebrow">{t("currentSet")}</span><h1>{t("summaryReport")}</h1></div><ReportViewSelector view={reportView} onViewChange={setReportView} /><div className="page-actions"><button className="command-button" type="button" onClick={actions.exportCsv}><FileSpreadsheet size={17} />CSV</button><button className="command-button" type="button" onClick={actions.exportGeoJson}><FileJson size={17} />GeoJSON</button></div></header>
    <div className="report-metrics"><article><strong>{format.number(summary.count)}</strong><span>{t("visiblePlots")}</span></article><article><strong>{format.number(summary.totalArea, { maximumFractionDigits: 4 })}</strong><span>{t("totalHectares")}</span></article><article><strong>{format.number(summary.byCategory.length)}</strong><span>{t("activeCategories")}</span></article>{canViewExpenses ? <article><strong>{format.number(visibleStageCost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 })}</strong><span><Coins size={14} />{t("totalStageExpenses")}</span></article> : null}</div>
    <StatusReport plots={plots} categories={categories} statuses={scopedStatuses} resultStatusProgress={resultStatusProgress} view={reportView} canViewExpenses={canViewExpenses} />
    <div className="report-layout"><section><h2>{t("byCategory")}</h2><div className="report-category-list">{summary.byCategory.map((item) => <div key={item.id}><span className="category-line__swatch" style={{ background: item.color }} /><strong>{item.name}</strong><span>{t("pieces", { count: item.count })}</span><span>{t("hectares", { area: format.number(item.area, { maximumFractionDigits: 4 }) })}</span></div>)}</div></section>
      <aside className="report-export"><h2>{t("saveReport")}</h2><p>{t("reportNote")}</p><button className="command-button command-button--primary" disabled={Boolean(busy) || !hasReportData} type="button" onClick={() => run("xlsx")}><FileSpreadsheet size={17} />{busy === "xlsx" ? t("generating") : t("downloadXlsx")}</button><button className="command-button" disabled={Boolean(busy) || !hasReportData} type="button" onClick={() => run("pdf")}><Download size={17} />{busy === "pdf" ? t("generating") : t("downloadPdf")}</button><button className="command-button" disabled={Boolean(busy) || !hasReportData} type="button" onClick={() => run("docx")}><FileText size={17} />{busy === "docx" ? t("generating") : t("downloadDocx")}</button><button className="command-button" disabled={!hasReportData} type="button" onClick={printReport}><Printer size={17} />{t("print")}</button></aside>
    </div>
  </section>;
}

type ProfileMessage = { kind: "success" | "error"; text: string } | null;

function PasswordField({ name, label, autoComplete }: { name: string; label: string; autoComplete: "current-password" | "new-password" }) {
  const t = useTranslations("panels");
  const [visible, setVisible] = useState(false);
  const visibilityLabel = visible ? t("hideField", { label }) : t("showField", { label });

  return <label>{label}<div className="profile-password-field"><input name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={autoComplete === "new-password" ? 10 : undefined} maxLength={128} required /><button type="button" title={visibilityLabel} aria-label={visibilityLabel} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

function passwordErrorKey(error: { code?: string }) {
  if (error.code === "INVALID_PASSWORD") return "invalidPassword";
  if (error.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return "passwordLoginUnavailable";
  if (error.code === "PASSWORD_TOO_SHORT") return "passwordTooShort";
  if (error.code === "PASSWORD_TOO_LONG") return "passwordTooLong";
  return "passwordChangeFailed";
}


export function ProfilePanel({ user, googleEnabled, preview, workspace, testWorkspaceEnabled, plotStatuses, actions }: { user: WorkspaceUser; googleEnabled: boolean; preview: boolean; workspace: DataWorkspace; testWorkspaceEnabled: boolean; plotStatuses: PlotStatusDefinition[]; actions: WorkspaceActions }) {
  const t = useTranslations("panels");
  const common = useTranslations("common");
  const workspaceT = useTranslations("workspace");
  const [message, setMessage] = useState<ProfileMessage>(null);
  const [busy, setBusy] = useState<"name" | "password" | "google" | null>(null);
  const [providers, setProviders] = useState<string[]>(preview ? ["credential"] : []);
  const [accountsLoaded, setAccountsLoaded] = useState(preview);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void authClient.listAccounts().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage({ kind: "error", text: t("accountsCheckFailed") });
      setProviders(data?.map((account) => account.providerId) ?? []);
      setAccountsLoaded(true);
    });
    return () => { active = false; };
  }, [preview, t]);

  const updateName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("name"); setMessage(null);
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (preview) { setMessage({ kind: "success", text: t("previewNameSaved") }); setBusy(null); return; }
    const { error } = await authClient.updateUser({ name });
    setMessage(error ? { kind: "error", text: t("nameUpdateFailed") } : { kind: "success", text: t("nameUpdated") }); setBusy(null);
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("password"); setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const newPasswordConfirm = String(data.get("newPasswordConfirm") ?? "");
    if (newPassword.length < 10) { setMessage({ kind: "error", text: t("passwordTooShort") }); setBusy(null); return; }
    if (newPassword === currentPassword) { setMessage({ kind: "error", text: t("passwordMustDiffer") }); setBusy(null); return; }
    if (newPassword !== newPasswordConfirm) { setMessage({ kind: "error", text: t("passwordMismatch") }); setBusy(null); return; }
    if (preview) { setMessage({ kind: "success", text: t("previewPasswordChecked") }); setBusy(null); form.reset(); return; }
    try {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (error) { setMessage({ kind: "error", text: t(passwordErrorKey(error)) }); return; }
      form.reset();
      setMessage({ kind: "success", text: t("passwordChanged") });
    } catch {
      setMessage({ kind: "error", text: t("connectionFailed") });
    } finally {
      setBusy(null);
    }
  };
  const connectGoogle = async () => {
    setBusy("google"); setMessage(null);
    if (preview) { setProviders((current) => [...new Set([...current, "google"])]); setMessage({ kind: "success", text: t("previewGoogleConnected") }); setBusy(null); return; }
    const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/" });
    if (error) { setMessage({ kind: "error", text: t("googleConnectFailed") }); setBusy(null); }
  };
  const signOut = async () => { if (preview) return; await authClient.signOut(); window.location.href = "/sign-in"; };
  const googleLinked = providers.includes("google");
  const passwordAvailable = preview || providers.includes("credential");
  return <section className="workspace-page" onClickCapture={(event) => { const target = event.target; if (!(target instanceof Element) || !target.closest('a[href="/admin/users"]')) return; event.preventDefault(); actions.setSection("users"); }}><header className="workspace-page__header"><div><span className="eyebrow">{t("account")}</span><h1>{workspaceT("profile")}</h1></div><span className="role-badge">{user.role === "admin" ? t("administrator") : user.accessLevel === "edit" ? t("editing") : t("readOnly")}</span></header>
    <div className="profile-layout"><section className="profile-summary"><span className="profile-avatar"><UserRound size={26} /></span><strong>{user.name}</strong><span>{user.email}</span>{user.role === "admin" ? <Link className="command-button" href="/admin/users">{t("users")}</Link> : null}</section><div className="profile-forms"><section className="profile-connection"><div><span><strong>{t("language")}</strong><small>{t("languageHint")}</small></span></div><LanguageSwitcher /></section><form onSubmit={updateName}><h2>{t("systemName")}</h2><label>{common("name")}<input name="name" defaultValue={user.name} required maxLength={100} /></label><button className="command-button" disabled={busy !== null} type="submit"><Save size={17} />{t("saveName")}</button></form>{passwordAvailable ? <form onSubmit={changePassword}><h2>{t("changePassword")}</h2><PasswordField name="currentPassword" label={t("currentPassword")} autoComplete="current-password" /><PasswordField name="newPassword" label={t("newPassword")} autoComplete="new-password" /><PasswordField name="newPasswordConfirm" label={t("repeatPassword")} autoComplete="new-password" /><button className="command-button" disabled={busy !== null} type="submit"><KeyRound size={17} />{busy === "password" ? common("saving") : t("changePassword")}</button></form> : accountsLoaded ? <section className="profile-connection"><div><span className="profile-connection__icon"><KeyRound size={19} /></span><span><strong>{t("passwordProvider")}</strong><small>{t("externalLogin")}</small></span></div></section> : null}{googleEnabled && user.role !== "admin" ? <section className="profile-connection"><div><span className="profile-connection__icon">{googleLinked ? <CircleCheck size={19} /> : <Link2 size={19} />}</span><span><strong>Google</strong><small>{googleLinked ? t("connected") : t("notConnected")}</small></span></div>{googleLinked ? <span className="role-badge">{t("active")}</span> : <button className="command-button" disabled={busy !== null || !accountsLoaded} type="button" onClick={connectGoogle}><Link2 size={17} />{t("connect")}</button>}</section> : null}{user.role === "admin" ? <div className="profile-mobile-workspace-settings"><PlotStatusSettings statuses={plotStatuses} actions={actions} /><WorkspaceAdminSettings actions={actions} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} /></div> : null}{message ? <p className="form-message" data-kind={message.kind} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}<small className="profile-app-version">{t("appVersion", { version: appVersion })}</small><button className="danger-button" type="button" onClick={signOut}><LogOut size={17} />{t("signOut")}</button></div></div>
  </section>;
}

export function SettingsPanel({ actions, canImport, plotStatuses, workspace, testWorkspaceEnabled, canManageWorkspaces, canManageStatuses }: { actions: WorkspaceActions; canImport: boolean; plotStatuses: PlotStatusDefinition[]; workspace: DataWorkspace; testWorkspaceEnabled: boolean; canManageWorkspaces: boolean; canManageStatuses: boolean }) {
  const t = useTranslations("panels");
  return <section className="workspace-page"><header className="workspace-page__header"><div><span className="eyebrow">{t("dataExchange")}</span><h1>{t("settings")}</h1></div><span className="app-version">{t("appVersion", { version: appVersion })}</span></header><div className="settings-actions">{canImport ? <button className="command-button command-button--primary" type="button" onClick={actions.openImport}><FileJson size={18} />{t("importData")}</button> : null}<button className="command-button" type="button" onClick={actions.exportGeoJson}><Download size={18} />{t("exportGeoJson")}</button><button className="command-button" type="button" onClick={actions.exportCsv}><FileSpreadsheet size={18} />{t("exportCsv")}</button></div>{canManageStatuses ? <PlotStatusSettings statuses={plotStatuses} actions={actions} /> : null}{canManageWorkspaces ? <WorkspaceAdminSettings actions={actions} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} /> : null}</section>;
}

function PlotStatusSettings({ statuses, actions }: { statuses: PlotStatusDefinition[]; actions: WorkspaceActions }) {
  const t = useTranslations("panels");
  const common = useTranslations("common");
  const [draft, setDraft] = useState(statuses);
  const [scope, setScope] = useState<PlotStatusScope>("wtg");
  const [saving, setSaving] = useState(false);
  const scopedDraft = statusesForScope(draft, scope);

  const replaceScope = (nextScope: PlotStatusDefinition[]) => setDraft((current) => plotStatusScopes.flatMap((itemScope) => itemScope === scope ? nextScope : statusesForScope(current, itemScope)));

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= scopedDraft.length) return;
    const next = [...scopedDraft];
    [next[index], next[destination]] = [next[destination], next[index]];
    replaceScope(next);
  };
  const save = async () => {
    setSaving(true);
    const saved = await actions.savePlotStatuses(draft);
    if (saved) setDraft(saved);
    setSaving(false);
  };

  return <section className="plot-status-settings"><header><div><span className="eyebrow">{t("currentDatabaseDirectory")}</span><h2>{t("plotStatuses")}</h2></div><button className="command-button" type="button" onClick={() => replaceScope([...scopedDraft, { id: `${scope}_status_${crypto.randomUUID()}`, name: nextStatusName(scopedDraft, (number) => t("newStatus", { number })), scope }])}><Plus size={17} />{t("addStatus")}</button></header><label className="plot-status-settings__scope"><span>{t("statusProcess")}</span><select value={scope} onChange={(event) => setScope(event.target.value as PlotStatusScope)}>{plotStatusScopes.map((itemScope) => <option key={itemScope} value={itemScope}>{t(`statusScope_${itemScope}`)}</option>)}</select></label><div className="plot-status-list">{scopedDraft.map((item, index) => <div className="plot-status-row" key={item.id}><span className="plot-status-row__order">{index + 1}</span><textarea aria-label={t("statusName", { number: index + 1 })} value={item.name} maxLength={160} rows={2} onChange={(event) => setDraft((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, name: event.target.value } : candidate))} /><button className="icon-button" type="button" disabled={index === 0} onClick={() => move(index, -1)} title={t("moveUp")} aria-label={t("moveStatusUp", { name: item.name })}><ArrowUp size={17} /></button><button className="icon-button" type="button" disabled={index === scopedDraft.length - 1} onClick={() => move(index, 1)} title={t("moveDown")} aria-label={t("moveStatusDown", { name: item.name })}><ArrowDown size={17} /></button><button className="icon-button" type="button" onClick={() => replaceScope(scopedDraft.filter(({ id }) => id !== item.id))} title={t("deleteStatus")} aria-label={t("deleteNamedStatus", { name: item.name })}><Trash2 size={17} /></button></div>)}</div><footer><small>{t("statusOrderHint")}</small><button className="command-button command-button--primary" disabled={saving} type="button" onClick={() => void save()}><Save size={17} />{saving ? common("saving") : t("saveDirectory")}</button></footer></section>;
}

function nextStatusName(statuses: PlotStatusDefinition[], formatName: (number: number) => string) {
  let suffix = statuses.length + 1;
  while (statuses.some(({ name }) => name === formatName(suffix))) suffix += 1;
  return formatName(suffix);
}

function WorkspaceAdminSettings({ actions, workspace, testWorkspaceEnabled }: { actions: WorkspaceActions; workspace: DataWorkspace; testWorkspaceEnabled: boolean }) {
  const t = useTranslations("panels");
  return <section className="workspace-admin-settings" data-workspace={workspace}><div><span className="eyebrow">{t("dataAreas")}</span><h2>{t("testDatabase")}</h2></div><label className="toggle-setting"><span><strong>{t("showTestDatabase")}</strong><small>{testWorkspaceEnabled ? t("testAvailableAll") : t("productionOnly")}</small></span><input type="checkbox" role="switch" checked={testWorkspaceEnabled} onChange={(event) => void actions.setTestWorkspaceEnabled(event.target.checked)} /><i aria-hidden="true" /></label>{testWorkspaceEnabled ? <button className="danger-button" type="button" onClick={() => void actions.clearSandbox()}><Trash2 size={17} />{t("clearTestDatabase")}</button> : null}</section>;
}
