"use client";

import { useState } from "react";
import { Bell, FileBarChart, History, Layers3, List, Map, Plus, Search, Upload, UserRound, X } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { PlotDetails } from "../PlotDetails";
import { PlotList } from "../PlotList";
import { LayersPanel, ProfilePanel, ReportsPanel } from "../WorkspacePanels";
import type { WorkspaceViewProps } from "../types";
import { AuditPanel } from "../AuditPanel";

type MobileTab = "map" | "plots" | "reports" | "history" | "profile";

export function MobileWorkspace(props: WorkspaceViewProps) {
  const [tab, setTab] = useState<MobileTab>("map"); const [searchOpen, setSearchOpen] = useState(false); const [detailsOpen, setDetailsOpen] = useState(false); const [layersOpen, setLayersOpen] = useState(false);
  const isAdmin = props.user.role === "admin";
  const selectPlot = (id: string) => { props.actions.select(id); if (tab === "map") setDetailsOpen(true); };
  return <main className="mobile-shell" data-workspace={props.workspace} data-has-workspace-switch={!props.preview && props.testWorkspaceEnabled}>
    <header className="mobile-header"><div className="brand-lockup"><span className="brand-mark">GP</span><strong>GeoPartners</strong></div><div className="mobile-header__actions"><button className="icon-button" type="button" onClick={() => setSearchOpen((value) => !value)} aria-label="Пошук"><Search size={20} /></button><button className="icon-button" type="button" onClick={props.actions.openNotifications} aria-label="Сповіщення"><Bell size={20} /></button></div></header>
    {!props.preview && props.testWorkspaceEnabled ? <label className="mobile-workspace-switch" data-workspace={props.workspace}><span /><select aria-label="База даних" value={props.workspace} onChange={(event) => void props.actions.setWorkspace(event.target.value as "production" | "sandbox")}><option value="production">Робоча база</option><option value="sandbox">Тестова база</option></select></label> : null}
    {searchOpen ? <div className="mobile-search"><Search size={18} /><input autoFocus value={props.query} onChange={(event) => props.actions.setQuery(event.target.value)} placeholder="Пошук ділянки" /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Закрити пошук"><X size={19} /></button></div> : null}
    <section className="mobile-content">
      {tab === "map" ? <div className="mobile-map"><MapCanvas compact plots={props.plots} categories={props.categories} baseMap={props.baseMap} selectedId={props.selectedId} onSelect={selectPlot} /><div className="mobile-map__counter">{props.plots.length} ділянки</div><button className="mobile-layer-button" type="button" onClick={() => setLayersOpen(true)} aria-label="Шари"><Layers3 size={21} /></button><button className="mobile-add-button" type="button" onClick={props.actions.openAdd} aria-label="Додати ділянку"><Plus size={24} /></button></div> : null}
      {tab === "plots" ? <div className="mobile-list-view"><div className="mobile-view-heading"><div><span className="eyebrow">Робочий набір</span><h1>Ділянки</h1></div>{isAdmin ? <button className="command-button" type="button" onClick={props.actions.openImport}><Upload size={17} />Імпорт</button> : null}</div><PlotList plots={props.plots} selectedId={props.selectedId} onSelect={(id) => { selectPlot(id); const plot = props.plots.find(({ properties }) => properties.id === id); if (plot) props.actions.openCard(plot); }} categories={props.categories} /></div> : null}
      {tab === "reports" ? <ReportsPanel plots={props.plots} categories={props.categories} actions={props.actions} /> : null}
      {tab === "history" ? <AuditPanel preview={props.preview} baseMap={props.baseMap} canRestore={isAdmin} onRestore={props.actions.restoreAuditEntry} workspace={props.workspace} /> : null}
      {tab === "profile" ? <ProfilePanel user={props.user} googleEnabled={props.googleEnabled} preview={props.preview} workspace={props.workspace} testWorkspaceEnabled={props.testWorkspaceEnabled} actions={props.actions} /> : null}
    </section>
    {detailsOpen && tab === "map" ? <section className="mobile-sheet" aria-label="Відомості про ділянку"><div className="mobile-sheet__handle" /><button className="mobile-sheet__close" type="button" onClick={() => setDetailsOpen(false)} aria-label="Закрити"><X size={20} /></button><PlotDetails compact plot={props.selectedPlot} categories={props.categories} onEdit={props.actions.openEdit} onDocuments={props.actions.openDocuments} onOpenCard={props.actions.openCard} /></section> : null}
    {layersOpen ? <section className="mobile-overlay-page"><header><h2>Шари карти</h2><button className="icon-button" type="button" onClick={() => setLayersOpen(false)} aria-label="Закрити"><X size={20} /></button></header><LayersPanel categories={props.categories} baseMap={props.baseMap} actions={props.actions} canManage={isAdmin} /></section> : null}
    <nav className="mobile-nav" aria-label="Основна навігація"><MobileNavButton active={tab === "map"} label="Карта" onClick={() => setTab("map")} icon={<Map size={21} />} /><MobileNavButton active={tab === "plots"} label="Ділянки" onClick={() => setTab("plots")} icon={<List size={21} />} /><MobileNavButton active={tab === "reports"} label="Звіти" onClick={() => setTab("reports")} icon={<FileBarChart size={21} />} /><MobileNavButton active={tab === "history"} label="Журнал" onClick={() => setTab("history")} icon={<History size={21} />} /><MobileNavButton active={tab === "profile"} label="Профіль" onClick={() => setTab("profile")} icon={<UserRound size={21} />} /></nav>
  </main>;
}

function MobileNavButton({ active, label, onClick, icon }: { active: boolean; label: string; onClick: () => void; icon: React.ReactNode }) { return <button data-active={active} type="button" onClick={onClick}>{icon}<span>{label}</span></button>; }
