"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { demoPlots, type CategoryDefinition } from "@/data/demo";
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
import type { BaseMapId, PlotFeature, WorkspaceActions, WorkspaceSection, WorkspaceUser } from "./types";
import "./workspace.css";

type Modal = { type: "add" } | { type: "edit" | "documents" | "card"; plot: PlotFeature } | { type: "import" | "notifications" } | null;

export function Workspace({ initialPlots, initialCategories, user, googleEnabled = false, preview = false, workspace = "production", testWorkspaceEnabled = false }: { initialPlots?: PlotFeature[]; initialCategories?: Record<string, CategoryDefinition>; user?: WorkspaceUser; googleEnabled?: boolean; preview?: boolean; workspace?: DataWorkspace; testWorkspaceEnabled?: boolean }) {
  const isMobile = useMediaQuery("(max-width: 899px), (pointer: coarse) and (max-width: 1100px)");
  const [previewSnapshot] = useState(() => readPreviewSnapshot(preview));
  const startingPlots = previewSnapshot?.plots?.length ? previewSnapshot.plots : (initialPlots ?? demoPlots.features);
  const [plots, setPlots] = useState<PlotFeature[]>(startingPlots);
  const [categories, setCategories] = useState<Record<string, CategoryDefinition>>(categoriesWithDefaults(previewSnapshot?.categories ?? initialCategories ?? {}));
  const [selectedId, setSelectedId] = useState<string | null>(startingPlots[1]?.properties.id ?? startingPlots[0]?.properties.id ?? null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("map");
  const [baseMap, setBaseMap] = useState<BaseMapId>(previewSnapshot?.baseMap ?? "streets");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const currentUser = user ?? { name: "Демо Адміністратор", email: "admin@example.com", role: "admin" as const };
  const canDeletePlots = hasPermission(currentUser, "plots.delete"); const canImport = hasPermission(currentUser, "imports.run"); const canManageCategories = hasPermission(currentUser, "categories.manage"); const canRestoreVersions = hasPermission(currentUser, "versions.restore"); const canManageWorkspaces = hasPermission(currentUser, "workspaces.manage");

  useEffect(() => {
    if (preview) localStorage.setItem("geopartners-preview", JSON.stringify({ plots, categories, baseMap }));
  }, [baseMap, categories, plots, preview]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredPlots = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("uk");
    if (!normalizedQuery) return plots;
    return plots.filter(({ properties }) => [properties.cadastralNumber, properties.name, properties.owner, properties.lessee, properties.status].join(" ").toLocaleLowerCase("uk").includes(normalizedQuery));
  }, [plots, query]);
  const selectedPlot = plots.find(({ properties }) => properties.id === selectedId) ?? null;

  const persistPlot = useCallback(async (next: PlotFeature, exists = false) => {
    if (!preview) {
      const response = await fetch(exists ? `/api/plots/${encodeURIComponent(next.properties.id)}` : "/api/plots", { method: exists ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Не вдалося зберегти ділянку.");
    }
    setPlots((current) => exists ? current.map((plot) => plot.properties.id === next.properties.id ? next : plot) : [...current, next]);
    setSelectedId(next.properties.id); setModal(null); setToast(exists ? "Зміни ділянки збережено." : "Ділянку додано.");
  }, [preview]);

  const removePlot = useCallback(async (target: PlotFeature) => {
    if (!canDeletePlots) { setToast("Видалення ділянок доступне лише адміністратору."); return; }
    if (!window.confirm(`Видалити ділянку ${target.properties.cadastralNumber}?`)) return;
    if (!preview) {
      const response = await fetch(`/api/plots/${encodeURIComponent(target.properties.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не вдалося видалити ділянку.");
    }
    setPlots((current) => current.filter(({ properties }) => properties.id !== target.properties.id));
    setSelectedId((current) => current === target.properties.id ? null : current); setModal(null); setToast("Ділянку видалено.");
  }, [canDeletePlots, preview]);

  const persistCategories = useCallback(async (next: Record<string, CategoryDefinition>) => {
    if (!canManageCategories) { setToast("Керування категоріями доступне лише адміністратору."); return; }
    setCategories(next);
    if (!preview) await fetch("/api/categories", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
  }, [canManageCategories, preview]);

  const importPlots = async (result: ImportResult) => {
    const mergedCategories = categoriesWithDefaults({ ...categories, ...result.categories });
    const prepared = result.plots.map((imported) => {
      const duplicate = plots.find(({ properties }) => properties.cadastralNumber === imported.properties.cadastralNumber);
      return duplicate ? { ...imported, properties: { ...imported.properties, id: duplicate.properties.id } } : imported;
    });
    const finalPlots = new Map(plots.map((plot) => [plot.properties.id, plot]));
    for (const item of prepared) finalPlots.set(item.properties.id, item);
    for (const item of prepared) {
      const geometryErrors = validatePolygonGeometry(item.geometry).issues.filter(({ level }) => level === "error");
      if (geometryErrors.length) throw new Error(`${item.properties.cadastralNumber}: ${geometryErrors.map(({ message }) => message).join(" ")}`);
    }
    await persistCategories(mergedCategories);
    let added = 0; let updated = 0;
    for (const next of prepared) {
      const duplicate = plots.find(({ properties }) => properties.id === next.properties.id);
      if (!preview) {
        const response = await fetch(duplicate ? `/api/plots/${encodeURIComponent(next.properties.id)}` : "/api/plots", { method: duplicate ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
        if (!response.ok) throw new Error(`Не вдалося імпортувати ${next.properties.cadastralNumber}.`);
      }
      setPlots((current) => duplicate ? current.map((plot) => plot.properties.id === duplicate.properties.id ? next : plot) : [...current, next]);
      if (duplicate) updated += 1;
      else added += 1;
    }
    setModal(null); setToast(`Імпорт завершено: додано ${added}, оновлено ${updated}${result.skipped.length ? `, пропущено ${result.skipped.length}` : ""}.`);
  };

  const importFiles = async (files: File[]) => {
    if (!preview) {
      const form = new FormData(); files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/import", { method: "POST", body: form }); const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Не вдалося імпортувати пакет.");
      const saved = body.plots as PlotFeature[]; const returnedCategories = body.categories as Record<string, CategoryDefinition>;
      setPlots((current) => { const next = [...current]; for (const item of saved) { const index = next.findIndex(({ properties }) => properties.id === item.properties.id || properties.cadastralNumber === item.properties.cadastralNumber); if (index >= 0) next[index] = item; else next.push(item); } return next; });
      setCategories((current) => categoriesWithDefaults({ ...current, ...returnedCategories })); if (saved[0]) setSelectedId(saved[0].properties.id);
      setModal(null); setToast(`Імпортовано ${saved.length} ділянок${body.warnings?.length ? `; попереджень: ${body.warnings.length}` : ""}.`); return;
    }
    const geoFiles = files.filter((file) => /\.(geo)?json$/i.test(file.name)); const pdfFiles = files.filter((file) => /\.pdf$/i.test(file.name));
    const results = await Promise.all(geoFiles.map(async (file) => normalizeImport(JSON.parse(await file.text()), file.name)));
    const combined: ImportResult = { plots: results.flatMap(({ plots }) => plots), categories: Object.assign({}, ...results.map(({ categories }) => categories)), skipped: results.flatMap(({ skipped }) => skipped) };
    if (pdfFiles.length) {
      const form = new FormData(); pdfFiles.forEach((file) => form.append("files", file)); const response = await fetch("/api/import/inspect", { method: "POST", body: form }); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не вдалося прочитати PDF.");
      for (const plot of combined.plots) {
        const digits = plot.properties.cadastralNumber.replace(/\D/g, ""); const source = plot.properties.sourceFilename?.toLocaleLowerCase();
        const document = body.documents.find((item: { stem: string; metadata: { cadastralNumber: string } }) => item.stem === source || item.metadata.cadastralNumber.replace(/\D/g, "") === digits);
        if (!document) continue;
        if (document.metadata.cadastralNumber && document.metadata.cadastralNumber.replace(/\D/g, "") !== digits) throw new Error(`Кадастровий номер у GeoJSON не збігається з ${document.name}.`);
        Object.assign(plot.properties, { cadastralNumber: document.metadata.cadastralNumber || plot.properties.cadastralNumber, areaHa: document.metadata.areaHa || plot.properties.areaHa, owner: document.metadata.owner || plot.properties.owner, lessee: document.metadata.lessee || plot.properties.lessee, documentName: document.name, documentUrl: URL.createObjectURL(pdfFiles.find((file) => file.name === document.name)!), hasDocument: true });
      }
    }
    await importPlots(combined);
  };

  const exportGeoJson = useCallback(() => downloadText(JSON.stringify(toFeatureCollection(plots, categories), null, 2), "geopartners-data.geojson", "application/geo+json"), [categories, plots]);
  const exportCsv = useCallback(() => downloadText(plotsToCsv(plots), "geopartners-plots.csv", "text/csv;charset=utf-8"), [plots]);
  const restoreAuditEntry = useCallback(async (id: string) => {
    if (!canRestoreVersions) throw new Error("Відновлення версій доступне лише адміністратору.");
    if (preview) { setToast("Версію відновлено у режимі перегляду."); return; }
    const response = await fetch(`/api/audit/${encodeURIComponent(id)}/restore`, { method: "POST" }); const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Не вдалося відновити версію.");
    const restored = body.plot as PlotFeature;
    setPlots((current) => { const index = current.findIndex(({ properties }) => properties.id === restored.properties.id); if (index < 0) return [...current, restored]; const next = [...current]; next[index] = restored; return next; });
    setSelectedId(restored.properties.id); setToast("Попередній стан ділянки відновлено.");
  }, [canRestoreVersions, preview]);
  const updateCategory = (id: string, changes: Partial<CategoryDefinition>) => void persistCategories({ ...categories, [id]: { ...categories[id], ...changes } });
  const setWorkspace = useCallback(async (nextWorkspace: DataWorkspace) => {
    if (preview || nextWorkspace === workspace) return;
    const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: nextWorkspace }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setToast(body?.error ?? "Не вдалося перемкнути базу."); return; }
    window.location.reload();
  }, [preview, workspace]);
  const setTestWorkspaceEnabled = useCallback(async (enabled: boolean) => {
    if (!canManageWorkspaces || preview) return;
    const response = await fetch("/api/workspace/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ testWorkspaceEnabled: enabled }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setToast(body?.error ?? "Не вдалося змінити налаштування баз."); return; }
    window.location.reload();
  }, [canManageWorkspaces, preview]);
  const clearSandbox = useCallback(async () => {
    if (!canManageWorkspaces || preview || !window.confirm("Очистити всі ділянки, категорії, документи та журнал тестової бази?")) return;
    const response = await fetch("/api/workspace/sandbox", { method: "DELETE" });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setToast(body?.error ?? "Не вдалося очистити тестову базу."); return; }
    if (workspace === "sandbox") window.location.reload();
    else setToast(`Тестову базу очищено. Видалено ділянок: ${body?.deletedPlots ?? 0}.`);
  }, [canManageWorkspaces, preview, workspace]);

  const actions: WorkspaceActions = {
    select: setSelectedId, setQuery, setSection: setActiveSection,
    openAdd: () => setModal({ type: "add" }), openEdit: (plot) => setModal({ type: "edit", plot }), remove: (plot) => void removePlot(plot),
    openImport: () => { if (canImport) setModal({ type: "import" }); else setToast("Імпорт доступний лише адміністратору."); }, openDocuments: (plot) => setModal({ type: "documents", plot }), openCard: (plot) => setModal({ type: "card", plot }), openNotifications: () => setModal({ type: "notifications" }),
    restoreAuditEntry,
    exportGeoJson, exportCsv, setBaseMap,
    toggleCategory: (id, visible) => { if (canManageCategories) updateCategory(id, { visible }); else setCategories((current) => ({ ...current, [id]: { ...current[id], visible } })); }, updateCategory,
    addCategory: () => { const id = `category_${Date.now()}`; void persistCategories({ ...categories, [id]: { name: "Нова категорія", color: "#3979a8", visible: true } }); },
    removeCategory: (id) => { if (id === "default" || !window.confirm(`Видалити категорію «${categories[id]?.name}»?`)) return; const next = { ...categories }; delete next[id]; setPlots((current) => current.map((plot) => plot.properties.category === id ? { ...plot, properties: { ...plot.properties, category: "default" } } : plot)); void persistCategories(next); },
    setWorkspace, setTestWorkspaceEnabled, clearSandbox,
  };

  if (isMobile === null) return <main className="workspace-loading" aria-live="polite"><span className="workspace-loading__mark">GP</span><span>Підготовка робочого простору…</span></main>;

  const sharedProps = { plots: filteredPlots, selectedPlot, selectedId, query, categories, activeSection, baseMap, user: currentUser, googleEnabled, preview, workspace, testWorkspaceEnabled, actions };

  return <>{isMobile ? <MobileWorkspace {...sharedProps} /> : <DesktopWorkspace {...sharedProps} />}
    {modal?.type === "add" ? <WorkspaceModal title="Нова ділянка" description="Заповніть картку та намалюйте контур на карті." onClose={() => setModal(null)} wide><PlotForm plot={null} neighbors={plots} categories={categories} baseMap={baseMap} onSave={(plot) => persistPlot(plot)} onCancel={() => setModal(null)} /></WorkspaceModal> : null}
    {modal?.type === "edit" ? <WorkspaceModal title="Редагування ділянки" onClose={() => setModal(null)} wide><PlotForm plot={modal.plot} neighbors={plots.filter(({ properties }) => properties.id !== modal.plot.properties.id)} categories={categories} baseMap={baseMap} onSave={(plot) => persistPlot(plot, true)} onDelete={canDeletePlots ? () => void removePlot(modal.plot) : undefined} onCancel={() => setModal(null)} /></WorkspaceModal> : null}
    {modal?.type === "import" ? <WorkspaceModal title="Імпорт ділянок і документів" description="GeoJSON надає координати, PDF - кадастрові реквізити та оригінал документа." onClose={() => setModal(null)} wide><ImportForm onImport={importFiles} onCancel={() => setModal(null)} existingPlots={plots} categories={categories} baseMap={baseMap} /></WorkspaceModal> : null}
    {modal?.type === "documents" ? <WorkspaceModal title="Документи ділянки" description={modal.plot.properties.cadastralNumber} onClose={() => setModal(null)}><div className="document-list"><button type="button" onClick={() => downloadText(JSON.stringify(modal.plot, null, 2), `${modal.plot.properties.cadastralNumber.replaceAll(":", "")}.geojson`, "application/geo+json")}><FileText size={20} /><span><strong>Геометрія ділянки</strong><small>GeoJSON</small></span><Download size={18} /></button>{modal.plot.properties.documentUrl ? <a href={modal.plot.properties.documentUrl} target="_blank" rel="noreferrer"><FileText size={20} /><span><strong>{modal.plot.properties.documentName ?? "Документ ділянки"}</strong><small>PDF</small></span><Download size={18} /></a> : <p>PDF для цієї ділянки ще не прикріплено.</p>}</div></WorkspaceModal> : null}
    {modal?.type === "card" ? <WorkspaceModal title="Картка ділянки" onClose={() => setModal(null)}><PlotDetails plot={modal.plot} categories={categories} onEdit={(plot) => setModal({ type: "edit", plot })} onDocuments={(plot) => setModal({ type: "documents", plot })} onOpenCard={() => undefined} /></WorkspaceModal> : null}
    {modal?.type === "notifications" ? <WorkspaceModal title="Сповіщення" onClose={() => setModal(null)}><div className="notification-panel"><ShieldCheck size={24} /><h3>Центр сповіщень</h3><p>{currentUser.role === "admin" ? "Нові заявки на реєстрацію відображаються в кабінеті адміністратора." : "Нових сповіщень немає."}</p>{currentUser.role === "admin" ? <Link className="command-button command-button--primary" href="/admin/registrations">Переглянути заявки</Link> : null}</div></WorkspaceModal> : null}
    {toast ? <div className="workspace-toast" role="status">{toast}</div> : null}
  </>;
}

function readPreviewSnapshot(preview: boolean) {
  if (!preview || typeof window === "undefined") return null;
  const saved = localStorage.getItem("geopartners-preview");
  if (!saved) return null;
  try { return JSON.parse(saved) as { plots?: PlotFeature[]; categories?: Record<string, CategoryDefinition>; baseMap?: BaseMapId }; }
  catch { localStorage.removeItem("geopartners-preview"); return null; }
}
