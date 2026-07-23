"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import type { Polygon } from "geojson";
import type { CategoryDefinition } from "@/data/demo";
import { GeometryEditor, type GeometryChangeReason } from "@/components/map/GeometryEditor";
import { calculatePolygonAreaHa, findPlotConflicts, validatePolygonGeometry } from "@/lib/geometry";
import type { BaseMapId, PlotFeature } from "./types";

export function PlotForm({ plot, neighbors, categories, baseMap, onSave, onDelete, onCancel }: { plot: PlotFeature | null; neighbors: PlotFeature[]; categories: Record<string, CategoryDefinition>; baseMap: BaseMapId; onSave: (plot: PlotFeature) => Promise<void>; onDelete?: () => void; onCancel: () => void }) {
  const initial = useMemo(() => plot?.properties ?? { id: crypto.randomUUID(), cadastralNumber: "", name: "", category: "default", areaHa: 0, projectCapacity: 0, mainCandidateCadastral: "", owner: "", lessee: "", status: "" }, [plot]);
  const initialGeometry = useMemo(() => plot?.geometry ? structuredClone(plot.geometry) : null, [plot]);
  const [geometry, setGeometry] = useState<Polygon | null>(initialGeometry);
  const [geometryText, setGeometryText] = useState(initialGeometry ? JSON.stringify(initialGeometry, null, 2) : "");
  const [areaHa, setAreaHa] = useState(String(initial.areaHa));
  const [areaCalculated, setAreaCalculated] = useState(false);
  const [conflicts, setConflicts] = useState(() => initialGeometry ? findPlotConflicts(initialGeometry, neighbors) : []);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  const updateGeometry = useCallback((next: Polygon | null, reason: GeometryChangeReason | "manual") => {
    setGeometry(next); setGeometryText(next ? JSON.stringify(next, null, 2) : ""); setConflicts(next ? findPlotConflicts(next, neighbors) : []); setError("");
    if (reason === "reset") { setAreaHa(String(initial.areaHa)); setAreaCalculated(false); return; }
    setAreaHa(next ? String(calculatePolygonAreaHa(next)) : "0"); setAreaCalculated(Boolean(next));
  }, [initial.areaHa, neighbors]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const data = new FormData(event.currentTarget);
    try {
      const source = String(data.get("geometry") ?? "").trim();
      if (!source) throw new Error("Намалюйте контур на карті або вставте геометрію GeoJSON.");
      const parsed = JSON.parse(source) as Polygon;
      if (parsed.type !== "Polygon" || !Array.isArray(parsed.coordinates)) throw new Error("Вкажіть геометрію Polygon у форматі GeoJSON.");
      const geometryErrors = validatePolygonGeometry(parsed).issues.filter(({ level }) => level === "error");
      if (geometryErrors.length) throw new Error(geometryErrors.map(({ message }) => message).join(" "));
      const next: PlotFeature = { type: "Feature", geometry: parsed, properties: { ...initial, cadastralNumber: String(data.get("cadastralNumber") ?? "").trim(), name: String(data.get("name") ?? "").trim(), category: String(data.get("category") ?? "default"), areaHa: Number(data.get("areaHa")) || 0, projectCapacity: Number(data.get("projectCapacity")) || 0, status: String(data.get("status") ?? "").trim(), mainCandidateCadastral: String(data.get("mainCandidateCadastral") ?? "").trim(), owner: String(data.get("owner") ?? "").trim(), lessee: String(data.get("lessee") ?? "").trim() } };
      if (!next.properties.cadastralNumber) throw new Error("Кадастровий номер обов'язковий.");
      setSaving(true); await onSave(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося зберегти ділянку."); setSaving(false); }
  };

  return <form className="plot-form" onSubmit={submit}><div className="form-grid">
    <label>Кадастровий номер<input name="cadastralNumber" defaultValue={initial.cadastralNumber} required /></label><label>Назва<input name="name" defaultValue={initial.name} /></label>
    <label>Категорія<select name="category" defaultValue={initial.category}>{Object.entries(categories).map(([id, category]) => <option key={id} value={id}>{category.name}</option>)}</select></label><label><span className="form-label-row"><span>Площа, га</span>{areaCalculated ? <small>За контуром</small> : null}</span><input name="areaHa" type="number" min="0" step="0.0001" value={areaHa} onChange={(event) => { setAreaHa(event.target.value); setAreaCalculated(false); }} /></label>
    <label>Проєктна потужність, МВт<input name="projectCapacity" type="number" min="0" step="0.01" defaultValue={initial.projectCapacity} /></label><label>Статус<input name="status" defaultValue={initial.status} /></label>
    <label className="form-grid__wide">Кадастровий номер основного кандидата<input name="mainCandidateCadastral" defaultValue={initial.mainCandidateCadastral} /></label><label className="form-grid__wide">Власник<input name="owner" defaultValue={initial.owner} /></label><label className="form-grid__wide">Орендар<input name="lessee" defaultValue={initial.lessee} /></label>
    <div className="form-grid__wide"><GeometryEditor geometry={geometry} initialGeometry={initialGeometry} neighbors={neighbors} conflicts={conflicts} baseMap={baseMap} onChange={updateGeometry} />{conflicts.length ? <div className="geometry-conflicts" role="status"><AlertTriangle size={19} /><div><strong>Накладання дозволено</strong><span>Контур буде збережено без зміни координат GeoJSON.</span>{conflicts.map((conflict) => <span key={conflict.plotId}>{conflict.cadastralNumber} · {formatOverlapArea(conflict.overlapAreaHa)}</span>)}</div></div> : null}</div>
    <details className="geometry-source form-grid__wide"><summary>Геометрія GeoJSON</summary><label>GeoJSON<textarea name="geometry" rows={7} placeholder='{"type":"Polygon","coordinates":[...]}' value={geometryText} onChange={(event) => { const value = event.target.value; setGeometryText(value); try { const parsed = JSON.parse(value) as Polygon; if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) updateGeometry(parsed, "manual"); } catch { /* Submit reports incomplete JSON. */ } }} spellCheck={false} /></label></details>
  </div>{error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions">{plot && onDelete ? <button className="danger-button" type="button" onClick={onDelete}><Trash2 size={17} />Видалити</button> : <span />}<button type="button" onClick={onCancel}>Скасувати</button><button className="command-button--primary" disabled={saving} type="submit"><Save size={17} />{saving ? "Збереження…" : "Зберегти"}</button></footer></form>;
}

function formatOverlapArea(areaHa: number) {
  return areaHa < 0.0001 ? "< 0,0001 га" : `${areaHa.toLocaleString("uk-UA", { maximumFractionDigits: 6 })} га`;
}
