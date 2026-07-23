"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { WorkspaceModal } from "@/components/workspace/WorkspaceModal";
import { calculatePolygonAreaHa } from "@/lib/geometry";
import type { VersionComparison } from "@/lib/audit";
import type { BaseMapId, PlotFeature } from "./types";

export function VersionCompareDialog({ comparison, baseMap, busy, error, onClose, onConfirm }: { comparison: VersionComparison; baseMap: BaseMapId; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const mapPlots = comparison.current ? [comparisonFeature(comparison.target, "version-target", "version-target"), comparisonFeature(comparison.current, "version-current", "version-current")] : [comparisonFeature(comparison.target, "version-target", "version-target")];
  const differences = compareFields(comparison.current, comparison.target); const blocked = comparison.blockingMessages.length > 0;
  const overlapFeatures = comparison.conflicts.map(({ geometry }) => ({ type: "Feature" as const, properties: {}, geometry }));
  return <WorkspaceModal title="Порівняння версій" description={comparison.target.properties.cadastralNumber} onClose={onClose} wide><div className="version-compare">
    <div className="version-compare__status" data-tone={blocked ? "error" : comparison.conflicts.length ? "warning" : "ok"}>{blocked || comparison.conflicts.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}<div><strong>{blocked ? "Відновлення зараз неможливе" : comparison.current ? "Версія готова до відновлення" : "Ділянку буде відновлено після видалення"}</strong><span>{blocked ? comparison.blockingMessages.join(" ") : comparison.conflicts.length ? `Виявлено накладань: ${comparison.conflicts.length}. Вони не блокують відновлення; координати версії буде збережено без змін.` : "Перевірки кадастрового номера та геометрії пройдено."}</span></div></div>
    <div className="version-compare__layout"><section className="version-compare__map"><MapCanvas plots={mapPlots} categories={{ default: { name: "Поточна", color: "#657169", visible: true }, "version-current": { name: "Поточна", color: "#657169", visible: true }, "version-target": { name: "Збережена", color: "#16845a", visible: true } }} baseMap={baseMap} selectedId="version-target" conflictIds={comparison.conflicts.length ? ["version-target"] : []} overlapFeatures={overlapFeatures} onSelect={() => undefined} /><div className="version-compare__legend"><span><i data-tone="current" />Поточна</span><span><i data-tone="target" />Збережена версія</span></div></section><section className="version-compare__diff"><header><strong>Зміни</strong><span>{differences.length} полів</span></header>{differences.length ? <div className="version-diff-list">{differences.map((item) => <div key={item.label}><strong>{item.label}</strong><span>{item.current}</span><ArrowRight size={14} /><span>{item.target}</span></div>)}</div> : <p className="version-compare__empty">Поточний стан уже відповідає цій версії.</p>}</section></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions"><span /><button type="button" onClick={onClose}>Скасувати</button><button className="command-button--primary" type="button" disabled={blocked || busy || !differences.length} onClick={onConfirm}><RotateCcw size={17} />{busy ? "Відновлення…" : "Відновити цю версію"}</button></footer>
  </div></WorkspaceModal>;
}

function comparisonFeature(plot: PlotFeature, id: string, category: string): PlotFeature { return { ...plot, properties: { ...plot.properties, id, category } }; }

function compareFields(current: PlotFeature | null, target: PlotFeature) {
  const fields = [
    ["Кадастровий номер", current?.properties.cadastralNumber, target.properties.cadastralNumber],
    ["Назва", current?.properties.name, target.properties.name],
    ["Категорія", current?.properties.category, target.properties.category],
    ["Площа", current ? `${current.properties.areaHa.toLocaleString("uk-UA")} га` : null, `${target.properties.areaHa.toLocaleString("uk-UA")} га`],
    ["Площа за контуром", current ? `${calculatePolygonAreaHa(current.geometry).toLocaleString("uk-UA")} га` : null, `${calculatePolygonAreaHa(target.geometry).toLocaleString("uk-UA")} га`],
    ["Проєктна потужність", current?.properties.projectCapacity, target.properties.projectCapacity],
    ["Статус", current?.properties.status, target.properties.status],
    ["Основний кандидат", current?.properties.mainCandidateCadastral, target.properties.mainCandidateCadastral],
    ["Власник", current?.properties.owner, target.properties.owner],
    ["Орендар", current?.properties.lessee, target.properties.lessee],
    ["Контур", current ? `${coordinateCount(current)} точок` : null, `${coordinateCount(target)} точок`],
    ["Документ", current?.properties.documentName, target.properties.documentName],
  ] as const;
  return fields.flatMap(([label, left, right]) => normalize(left) === normalize(right) && (label !== "Контур" || (current && JSON.stringify(current.geometry) === JSON.stringify(target.geometry))) ? [] : [{ label, current: current ? display(left) : "Відсутня", target: display(right) }]);
}

function coordinateCount(plot: PlotFeature) { return plot.geometry.coordinates.reduce((count, ring) => count + ring.length, 0); }
function normalize(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function display(value: unknown) { const text = normalize(value).trim(); return text || "Не визначено"; }
