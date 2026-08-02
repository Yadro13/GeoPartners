"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { demoPlots, type CategoryDefinition } from "@/data/demo";
import { defaultPlotStatuses, type PlotStatusDefinition } from "@/data/plot-statuses";
import { categoriesWithDefaults, downloadText, normalizeImport, plotsToCsv, toFeatureCollection, type ImportResult } from "@/lib/plot-data";
import { validatePolygonGeometry } from "@/lib/geometry";
import { hasPermission } from "@/lib/permissions";
import type { DataWorkspace } from "@/lib/data-workspace";
import { DesktopWorkspace } from "./desktop/DesktopWorkspace";
import { MobileWorkspace } from "./mobile/MobileWorkspace";
import { ImportForm } from "./ImportForm";
import { PlotForm } from "./PlotForm";
import { WorkspaceModal } from "./WorkspaceModal";
import { PlotDetails } from "./PlotDetails";
import { PlotStagesForm } from "./PlotStagesForm";
import { NotificationPanel } from "./NotificationPanel";
import { LocalePreferenceSync } from "@/components/LocalePreferenceSync";
import type { BaseMapId, PlotFeature, WorkspaceActions, WorkspaceSection, WorkspaceUser } from "./types";
import type { ManagedUser } from "@/components/admin/UserManagementTable";
import "./workspace.css";

type Modal = { type: "add" } | { type: "edit" | "stages" | "documents" | "card"; plot: PlotFeature } | { type: "import" | "notifications" } | null;

export function Workspace({ initialPlots, initialCategories, initialPlotStatuses, initialUsers = [], initialSection = "map", user, googleEnabled = false, preview = false, workspace = "production", testWorkspaceEnabled = false }: { initialPlots?: PlotFeature[]; initialCategories?: Record<string, CategoryDefinition>; initialPlotStatuses?: PlotStatusDefinition[]; initialUsers?: ManagedUser[]; initialSection?: WorkspaceSection; user?: WorkspaceUser; googleEnabled?: boolean; preview?: boolean; workspace?: DataWorkspace; testWorkspaceEnabled?: boolean }) {
  const t = useTranslations("workspace");
  const isMobile = useMediaQuery("(max-width: 899px), (pointer: coarse) and (max-width: 1100px)");
  const [previewSnapshot] = useState(() => readPreviewSnapshot(preview));
  const startingPlots = previewSnapshot?.plots?.length ? previewSnapshot.plots : (initialPlots ?? demoPlots.features);
  const [plots, setPlots] = useState<PlotFeature[]>(startingPlots);
  const [categories, setCategories] = useState<Record<string, CategoryDefinition>>(categoriesWithDefaults(previewSnapshot?.categories ?? initialCategories ?? {}));
  const [plotStatuses, setPlotStatuses] = useState<PlotStatusDefinition[]>(previewSnapshot?.plotStatuses ?? initialPlotStatuses ?? defaultPlotStatuses);
  const [selectedId, setSelectedId] = useState<string | null>(startingPlots[1]?.properties.id ?? startingPlots[0]?.properties.id ?? null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(initialSection);
  const [baseMap, setBaseMap] = useState<BaseMapId>(previewSnapshot?.baseMap ?? "streets");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const currentUser = user ?? { name: "Демо Адміністратор", email: "admin@example.com", role: "admin" as const, accessLevel: "edit" as const };
  const canEditPlots = hasPermission(currentUser, "plots.create") && hasPermission(currentUser, "plots.update"); const canDeletePlots = hasPermission(currentUser, "plots.delete"); const canImport = hasPermission(currentUser, "imports.run"); const canManageCategories = hasPermission(currentUser, "categories.manage"); const canManageStatuses = hasPermission(currentUser, "statuses.manage"); const canRestoreVersions = hasPermission(currentUser, "versions.restore"); const canManageWorkspaces = hasPermission(currentUser, "workspaces.manage");

  useEffect(() => {
    if (preview) localStorage.setItem("geopartners-preview", JSON.stringify({ plots, categories, plotStatuses, baseMap }));
  }, [baseMap, categories, plotStatuses, plots, preview]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredPlots = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("uk");
    if (!normalizedQuery) return plots;
    const statusNames = new Map(plotStatuses.map(({ id, name }) => [id, name]));
    return plots.filter(({ properties }) => [properties.cadastralNumber, properties.name, properties.owner, properties.lessee, ...(properties.statusProgress ?? []).map(({ statusId }) => statusNames.get(statusId) ?? "")].join(" ").toLocaleLowerCase("uk").includes(normalizedQuery));
  }, [plotStatuses, plots, query]);
  const selectedPlot = plots.find(({ properties }) => properties.id === selectedId) ?? null;

  const persistPlot = useCallback(async (next: PlotFeature, exists = false) => {
    if (!canEditPlots) throw new Error(t("readOnlyNote"));
    let saved = next;
    if (!preview) {
      const response = await fetch(exists ? `/api/plots/${encodeURIComponent(next.properties.id)}` : "/api/plots", { method: exists ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? t("plotSaveFailed"));
      saved = await response.json() as PlotFeature;
    }
    setPlots((current) => exists ? current.map((plot) => plot.properties.id === saved.properties.id ? saved : plot) : [...current, saved]);
    setSelectedId(saved.properties.id); setModal(null); setToast(exists ? t("changesSaved") : t("plotAdded"));
  }, [canEditPlots, preview, t]);

  const removePlot = useCallback(async (target: PlotFeature) => {
    if (!canDeletePlots) { setToast(t("deleteAdminOnly")); return; }
    if (!window.confirm(t("confirmDelete", { number: target.properties.cadastralNumber }))) return;
    try {
      if (!preview) {
        const response = await fetch(`/api/plots/${encodeURIComponent(target.properties.id)}`, { method: "DELETE" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? t("plotDeleteFailed"));
      }
      setPlots((current) => current.filter(({ properties }) => properties.id !== target.properties.id));
      setSelectedId((current) => current === target.properties.id ? null : current); setModal(null); setToast(t("plotDeleted"));
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("plotDeleteFailed"));
    }
  }, [canDeletePlots, preview, t]);

  const persistCategories = useCallback(async (next: Record<string, CategoryDefinition>) => {
    if (!canManageCategories) { setToast(t("categoryAdminOnly")); return false; }
    try {
      if (!preview) {
        const response = await fetch("/api/categories", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? t("categoriesSaveFailed"));
      }
      setCategories(next);
      return true;
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("categorySaveFailed"));
      return false;
    }
  }, [canManageCategories, preview, t]);

  const persistPlotStatuses = useCallback(async (next: PlotStatusDefinition[]) => {
    if (!canManageStatuses) { setToast(t("statusDirectoryAdminOnly")); return null; }
    try {
      let saved = next;
      if (!preview) {
        const response = await fetch("/api/plot-statuses", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? t("statusDirectoryFailed"));
        if (!Array.isArray(body)) throw new Error(t("invalidStatusDirectory"));
        saved = body as PlotStatusDefinition[];
      }
      const nextById = new Map(saved.map((item) => [item.id, item.name]));
      setPlots((current) => current.map((item) => {
        const statusProgress = (item.properties.statusProgress ?? []).filter((entry) => nextById.has(entry.statusId));
        const completedIds = new Set(statusProgress.map(({ statusId }) => statusId));
        const status = [...saved].reverse().find(({ id }) => completedIds.has(id))?.name ?? "";
        if (status === item.properties.status && statusProgress.length === (item.properties.statusProgress ?? []).length) return item;
        return { ...item, properties: { ...item.properties, status, statusProgress } };
      }));
      setPlotStatuses(saved);
      setToast(t("statusDirectorySaved"));
      return saved;
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("statusDirectoryFailed"));
      return null;
    }
  }, [canManageStatuses, preview, t]);

  const importPlots = async (result: ImportResult) => {
    const mergedCategories = categoriesWithDefaults({ ...categories, ...result.categories });
    const prepared = result.plots.map((imported) => {
      const duplicate = plots.find(({ properties }) => properties.cadastralNumber === imported.properties.cadastralNumber);
      return duplicate ? { ...imported, properties: { ...imported.properties, id: duplicate.properties.id, status: imported.properties.status || duplicate.properties.status, statusProgress: imported.properties.statusProgress?.length ? imported.properties.statusProgress : duplicate.properties.statusProgress } } : imported;
    });
    const finalPlots = new Map(plots.map((plot) => [plot.properties.id, plot]));
    for (const item of prepared) finalPlots.set(item.properties.id, item);
    for (const item of prepared) {
      const geometryErrors = validatePolygonGeometry(item.geometry).issues.filter(({ level }) => level === "error");
      if (geometryErrors.length) throw new Error(`${item.properties.cadastralNumber}: ${geometryErrors.map(({ message }) => message).join(" ")}`);
    }
    if (!await persistCategories(mergedCategories)) throw new Error(t("importCategoriesFailed"));
    let added = 0; let updated = 0;
    for (const next of prepared) {
      const duplicate = plots.find(({ properties }) => properties.id === next.properties.id);
      if (!preview) {
        const response = await fetch(duplicate ? `/api/plots/${encodeURIComponent(next.properties.id)}` : "/api/plots", { method: duplicate ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
        if (!response.ok) throw new Error(t("importPlotFailed", { number: next.properties.cadastralNumber }));
      }
      setPlots((current) => duplicate ? current.map((plot) => plot.properties.id === duplicate.properties.id ? next : plot) : [...current, next]);
      if (duplicate) updated += 1;
      else added += 1;
    }
    setModal(null); setToast(t("importComplete", { added, updated, skipped: result.skipped.length ? t("skippedSuffix", { count: result.skipped.length }) : "" }));
  };

  const importFiles = async (files: File[]) => {
    if (!preview) {
      const form = new FormData(); files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/import", { method: "POST", body: form }); const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? t("packageImportFailed"));
      const saved = body.plots as PlotFeature[]; const returnedCategories = body.categories as Record<string, CategoryDefinition>;
      setPlots((current) => { const next = [...current]; for (const item of saved) { const index = next.findIndex(({ properties }) => properties.id === item.properties.id || properties.cadastralNumber === item.properties.cadastralNumber); if (index >= 0) next[index] = item; else next.push(item); } return next; });
      setCategories((current) => categoriesWithDefaults({ ...current, ...returnedCategories })); if (saved[0]) setSelectedId(saved[0].properties.id);
      setModal(null); setToast(t("packageImported", { count: saved.length, warnings: body.warnings?.length ? t("warningsSuffix", { count: body.warnings.length }) : "" })); return;
    }
    const geoFiles = files.filter((file) => /\.(geo)?json$/i.test(file.name)); const pdfFiles = files.filter((file) => /\.pdf$/i.test(file.name));
    const results = await Promise.all(geoFiles.map(async (file) => normalizeImport(JSON.parse(await file.text()), file.name)));
    const combined: ImportResult = { plots: results.flatMap(({ plots }) => plots), categories: Object.assign({}, ...results.map(({ categories }) => categories)), skipped: results.flatMap(({ skipped }) => skipped) };
    if (pdfFiles.length) {
      const form = new FormData(); pdfFiles.forEach((file) => form.append("files", file)); const response = await fetch("/api/import/inspect", { method: "POST", body: form }); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("pdfReadFailed"));
      for (const plot of combined.plots) {
        const digits = plot.properties.cadastralNumber.replace(/\D/g, ""); const source = plot.properties.sourceFilename?.toLocaleLowerCase();
        const document = body.documents.find((item: { stem: string; metadata: { cadastralNumber: string } }) => item.stem === source || item.metadata.cadastralNumber.replace(/\D/g, "") === digits);
        if (!document) continue;
        if (document.metadata.cadastralNumber && document.metadata.cadastralNumber.replace(/\D/g, "") !== digits) throw new Error(t("cadastralPdfMismatch", { name: document.name }));
        Object.assign(plot.properties, { cadastralNumber: document.metadata.cadastralNumber || plot.properties.cadastralNumber, areaHa: document.metadata.areaHa || plot.properties.areaHa, owner: document.metadata.owner || plot.properties.owner, lessee: document.metadata.lessee || plot.properties.lessee, documentName: document.name, documentUrl: URL.createObjectURL(pdfFiles.find((file) => file.name === document.name)!), hasDocument: true });
      }
    }
    await importPlots(combined);
  };

  const exportGeoJson = useCallback(() => downloadText(JSON.stringify(toFeatureCollection(plots, categories), null, 2), "geopartners-data.geojson", "application/geo+json"), [categories, plots]);
  const exportCsv = useCallback(() => downloadText(plotsToCsv(plots), "geopartners-plots.csv", "text/csv;charset=utf-8"), [plots]);
  const restoreAuditEntry = useCallback(async (id: string) => {
    if (!canRestoreVersions) throw new Error(t("restoreAdminOnly"));
    if (preview) { setToast(t("previewVersionRestored")); return; }
    const response = await fetch(`/api/audit/${encodeURIComponent(id)}/restore`, { method: "POST" }); const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? t("versionRestoreFailed"));
    const restored = body.plot as PlotFeature;
    setPlots((current) => { const index = current.findIndex(({ properties }) => properties.id === restored.properties.id); if (index < 0) return [...current, restored]; const next = [...current]; next[index] = restored; return next; });
    setSelectedId(restored.properties.id); setToast(t("versionRestored"));
  }, [canRestoreVersions, preview, t]);
  const updateCategory = (id: string, changes: Partial<CategoryDefinition>) => void persistCategories({ ...categories, [id]: { ...categories[id], ...changes } });
  const setWorkspace = useCallback(async (nextWorkspace: DataWorkspace) => {
    if (preview || nextWorkspace === workspace) return;
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: nextWorkspace }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? t("workspaceSwitchFailed"));
      window.location.reload();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("workspaceSwitchFailed"));
    }
  }, [preview, t, workspace]);
  const setTestWorkspaceEnabled = useCallback(async (enabled: boolean) => {
    if (!canManageWorkspaces || preview) return;
    try {
      const response = await fetch("/api/workspace/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ testWorkspaceEnabled: enabled }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? t("databaseSettingsFailed"));
      window.location.reload();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("databaseSettingsRetry"));
    }
  }, [canManageWorkspaces, preview, t]);
  const clearSandbox = useCallback(async () => {
    if (!canManageWorkspaces || preview || !window.confirm(t("confirmClearTest"))) return;
    try {
      const response = await fetch("/api/workspace/sandbox", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? t("testDatabaseClearFailed"));
      if (workspace === "sandbox") window.location.reload();
      else setToast(t("testClearedCount", { count: body?.deletedPlots ?? 0 }));
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t("testDatabaseClearFailed"));
    }
  }, [canManageWorkspaces, preview, t, workspace]);

  const actions: WorkspaceActions = {
    select: setSelectedId, setQuery, setSection: setActiveSection,
    openAdd: () => { if (canEditPlots) setModal({ type: "add" }); else setToast(t("readOnlyNote")); }, openEdit: (plot) => { if (canEditPlots) setModal({ type: "edit", plot }); else setToast(t("readOnlyNote")); }, openStages: (plot) => setModal({ type: "stages", plot }), remove: (plot) => void removePlot(plot),
    openImport: () => { if (canImport) setModal({ type: "import" }); else setToast(t("importAdminOnly")); }, openDocuments: (plot) => setModal({ type: "documents", plot }), openCard: (plot) => setModal({ type: "card", plot }), openNotifications: () => setModal({ type: "notifications" }),
    restoreAuditEntry,
    exportGeoJson, exportCsv, setBaseMap,
    toggleCategory: (id, visible) => { if (canManageCategories) updateCategory(id, { visible }); else setCategories((current) => ({ ...current, [id]: { ...current[id], visible } })); }, updateCategory,
    addCategory: () => { const id = `category_${Date.now()}`; void persistCategories({ ...categories, [id]: { name: t("newCategory"), description: "", color: "#3979a8", visible: true } }); },
    removeCategory: (id) => { if (id === "default" || !window.confirm(t("confirmDeleteCategory", { name: categories[id]?.name }))) return; const next = { ...categories }; delete next[id]; void persistCategories(next).then((saved) => { if (saved) setPlots((current) => current.map((plot) => plot.properties.category === id ? { ...plot, properties: { ...plot.properties, category: "default" } } : plot)); }); },
    savePlotStatuses: persistPlotStatuses,
    setWorkspace, setTestWorkspaceEnabled, clearSandbox,
  };

  if (isMobile === null) return <main className="workspace-loading" aria-live="polite"><span className="workspace-loading__mark">GP</span><span>{t("preparing")}</span></main>;

  const sharedProps = { plots: filteredPlots, selectedPlot, selectedId, query, categories, plotStatuses, activeSection, baseMap, user: currentUser, googleEnabled, preview, workspace, testWorkspaceEnabled, canEditPlots, managedUsers: initialUsers, actions };

  return <><LocalePreferenceSync preferredLocale={currentUser.locale} />{isMobile ? <MobileWorkspace {...sharedProps} /> : <DesktopWorkspace {...sharedProps} />}
    {modal?.type === "add" ? <WorkspaceModal title={t("newPlot")} description={t("newPlotDescription")} onClose={() => setModal(null)} wide><PlotForm plot={null} neighbors={plots} categories={categories} baseMap={baseMap} onSave={(plot) => persistPlot(plot)} onCancel={() => setModal(null)} /></WorkspaceModal> : null}
    {modal?.type === "edit" ? <WorkspaceModal title={t("editPlotTitle")} onClose={() => setModal(null)} wide><PlotForm plot={modal.plot} neighbors={plots.filter(({ properties }) => properties.id !== modal.plot.properties.id)} categories={categories} baseMap={baseMap} onSave={(plot) => persistPlot(plot, true)} onDelete={canDeletePlots ? () => void removePlot(modal.plot) : undefined} onCancel={() => setModal(null)} /></WorkspaceModal> : null}
    {modal?.type === "stages" ? <WorkspaceModal title={t("plotStagesTitle")} description={modal.plot.properties.cadastralNumber} onClose={() => setModal(null)} wide><PlotStagesForm plot={modal.plot} statuses={plotStatuses} editable={canEditPlots} onSave={canEditPlots ? (plot) => persistPlot(plot, true) : undefined} onClose={() => setModal(null)} /></WorkspaceModal> : null}
    {modal?.type === "import" ? <WorkspaceModal title={t("importTitle")} description={t("importDescription")} onClose={() => setModal(null)} wide><ImportForm onImport={importFiles} onCancel={() => setModal(null)} existingPlots={plots} categories={categories} baseMap={baseMap} /></WorkspaceModal> : null}
    {modal?.type === "documents" ? <WorkspaceModal title={t("plotDocuments")} description={modal.plot.properties.cadastralNumber} onClose={() => setModal(null)}><div className="document-list"><button type="button" onClick={() => downloadText(JSON.stringify(modal.plot, null, 2), `${modal.plot.properties.cadastralNumber.replaceAll(":", "")}.geojson`, "application/geo+json")}><FileText size={20} /><span><strong>{t("plotGeometry")}</strong><small>GeoJSON</small></span><Download size={18} /></button>{modal.plot.properties.documentUrl ? <a href={modal.plot.properties.documentUrl} target="_blank" rel="noreferrer"><FileText size={20} /><span><strong>{modal.plot.properties.documentName ?? t("documents")}</strong><small>PDF</small></span><Download size={18} /></a> : <p>{t("documentMissing")}</p>}</div></WorkspaceModal> : null}
    {modal?.type === "card" ? <WorkspaceModal title={t("plotCard")} onClose={() => setModal(null)}><PlotDetails plot={modal.plot} categories={categories} plotStatuses={plotStatuses} onEdit={canEditPlots ? (plot) => setModal({ type: "edit", plot }) : undefined} onOpenStages={(plot) => setModal({ type: "stages", plot })} onDocuments={(plot) => setModal({ type: "documents", plot })} onOpenCard={() => undefined} /></WorkspaceModal> : null}
    {modal?.type === "notifications" ? <WorkspaceModal title={t("notifications")} onClose={() => setModal(null)}><NotificationPanel isAdmin={currentUser.role === "admin"} preview={preview} /></WorkspaceModal> : null}
    {toast ? <div className="workspace-toast" role="status">{toast}</div> : null}
  </>;
}

function readPreviewSnapshot(preview: boolean) {
  if (!preview || typeof window === "undefined") return null;
  const saved = localStorage.getItem("geopartners-preview");
  if (!saved) return null;
    try { return JSON.parse(saved) as { plots?: PlotFeature[]; categories?: Record<string, CategoryDefinition>; plotStatuses?: PlotStatusDefinition[]; baseMap?: BaseMapId }; }
  catch { localStorage.removeItem("geopartners-preview"); return null; }
}
