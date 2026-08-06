"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, Save, Trash2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { Polygon } from "geojson";
import { resultTypeByCategoryRole, type CategoryDefinition } from "@/data/demo";
import { GeometryEditor, type GeometryChangeReason } from "@/components/map/GeometryEditor";
import { calculatePolygonAreaHa, findPlotConflicts, validatePolygonGeometry } from "@/lib/geometry";
import { parsePlotResultLinks, plotResultTypes, type PlotResultLink, type PlotResultType } from "@/lib/plot-result-links";
import type { BaseMapId, PlotFeature } from "./types";

export function PlotForm({ plot, neighbors, categories, baseMap, onSave, onDelete, onCancel }: { plot: PlotFeature | null; neighbors: PlotFeature[]; categories: Record<string, CategoryDefinition>; baseMap: BaseMapId; onSave: (plot: PlotFeature) => Promise<void>; onDelete?: () => void; onCancel: () => void }) {
  const t = useTranslations("plotForm");
  const common = useTranslations("common");
  const format = useFormatter();
  const initial = useMemo(() => plot?.properties ?? { id: crypto.randomUUID(), cadastralNumber: "", name: "", category: "default", areaHa: 0, projectCapacity: 0, mainCandidateCadastral: "", owner: "", lessee: "", documentActualAt: "", resultLinks: [], status: "", statusProgress: [] }, [plot]);
  const initialGeometry = useMemo(() => plot?.geometry ? structuredClone(plot.geometry) : null, [plot]);
  const [geometry, setGeometry] = useState<Polygon | null>(initialGeometry);
  const [geometryText, setGeometryText] = useState(initialGeometry ? JSON.stringify(initialGeometry, null, 2) : "");
  const [areaHa, setAreaHa] = useState(String(initial.areaHa));
  const [categoryId, setCategoryId] = useState(initial.category);
  const [resultLinks, setResultLinks] = useState<PlotResultLink[]>(() => parsePlotResultLinks(initial.resultLinks));
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
      if (!source) throw new Error(t("drawRequired"));
      const parsed = JSON.parse(source) as Polygon;
      if (parsed.type !== "Polygon" || !Array.isArray(parsed.coordinates)) throw new Error(t("polygonRequired"));
      const geometryErrors = validatePolygonGeometry(parsed).issues.filter(({ level }) => level === "error");
      if (geometryErrors.length) throw new Error(geometryErrors.map(({ message }) => message).join(" "));
      if (resultLinks.some(({ number }) => !number.trim())) throw new Error(t("resultLinksHint"));
      const next: PlotFeature = { type: "Feature", geometry: parsed, properties: { ...initial, cadastralNumber: String(data.get("cadastralNumber") ?? "").trim(), name: String(data.get("name") ?? "").trim(), category: categoryId, areaHa: Number(data.get("areaHa")) || 0, owner: String(data.get("owner") ?? "").trim(), lessee: String(data.get("lessee") ?? "").trim(), documentActualAt: String(data.get("documentActualAt") ?? "").trim(), resultLinks: parsePlotResultLinks(resultLinks) } };
      if (!next.properties.cadastralNumber) throw new Error(t("cadastralRequired"));
      setSaving(true); await onSave(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("saveFailed")); setSaving(false); }
  };

  const allowedTypes = resultTypesForCategory(categories[categoryId]);
  const changeCategory = (nextId: string) => {
    const nextAllowed = new Set(resultTypesForCategory(categories[nextId]));
    const incompatible = resultLinks.filter(({ type }) => !nextAllowed.has(type));
    if (incompatible.length && !window.confirm(t("confirmRemoveResultLinks"))) return;
    if (incompatible.length) setResultLinks((current) => current.filter(({ type }) => nextAllowed.has(type)));
    setCategoryId(nextId);
  };

  return <form className="plot-form" onSubmit={submit}><div className="form-grid">
    <label>{t("cadastralNumber")}<input name="cadastralNumber" defaultValue={initial.cadastralNumber} required /></label><label>{t("title")}<input name="name" defaultValue={initial.name} /></label>
    <label>{t("category")}<select name="category" value={categoryId} onChange={(event) => changeCategory(event.target.value)}>{Object.entries(categories).map(([id, category]) => <option key={id} value={id}>{category.name}</option>)}</select></label><label><span className="form-label-row"><span>{t("areaHa")}</span>{areaCalculated ? <small>{t("fromOutline")}</small> : null}</span><input name="areaHa" type="number" min="0" step="0.0001" value={areaHa} onChange={(event) => { setAreaHa(event.target.value); setAreaCalculated(false); }} /></label>
    <label>{t("documentActualAt")}<input name="documentActualAt" type="datetime-local" defaultValue={initial.documentActualAt?.slice(0, 16)} /></label><span />
    {allowedTypes.length ? <ResultLinksEditor allowedTypes={allowedTypes} links={resultLinks} onChange={setResultLinks} /> : null}
    <label className="form-grid__wide">{t("owner")}<textarea name="owner" rows={2} defaultValue={initial.owner} /></label><label className="form-grid__wide">{t("lessee")}<textarea name="lessee" rows={2} defaultValue={initial.lessee} /></label>
    <div className="form-grid__wide"><GeometryEditor geometry={geometry} initialGeometry={initialGeometry} neighbors={neighbors} conflicts={conflicts} baseMap={baseMap} onChange={updateGeometry} />{conflicts.length ? <div className="geometry-conflicts" role="status"><AlertTriangle size={19} /><div><strong>{t("overlapAllowed")}</strong><span>{t("overlapInfo")}</span>{conflicts.map((conflict) => <span key={conflict.plotId}>{conflict.cadastralNumber} · {conflict.overlapAreaHa < 0.0001 ? "< 0.0001 ha" : `${format.number(conflict.overlapAreaHa, { maximumFractionDigits: 6 })} ha`}</span>)}</div></div> : null}</div>
    <details className="geometry-source form-grid__wide"><summary>{t("geometry")}</summary><label>GeoJSON<textarea name="geometry" rows={7} placeholder='{"type":"Polygon","coordinates":[...]}' value={geometryText} onChange={(event) => { const value = event.target.value; setGeometryText(value); try { const parsed = JSON.parse(value) as Polygon; if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) updateGeometry(parsed, "manual"); } catch { /* Submit reports incomplete JSON. */ } }} spellCheck={false} /></label></details>
  </div>{error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions">{plot && onDelete ? <button className="danger-button" type="button" onClick={onDelete}><Trash2 size={17} />{common("delete")}</button> : <span />}<button type="button" onClick={onCancel}>{common("cancel")}</button><button className="command-button--primary" disabled={saving} type="submit"><Save size={17} />{saving ? common("saving") : common("save")}</button></footer></form>;
}

function resultTypesForCategory(category?: CategoryDefinition): PlotResultType[] {
  if (category?.systemRole === "main_candidate" || category?.systemRole === "alternative_candidate") return [...plotResultTypes];
  const resultType = category?.systemRole ? resultTypeByCategoryRole[category.systemRole] : undefined;
  return resultType ? [resultType] : [];
}

function ResultLinksEditor({ allowedTypes, links, onChange }: { allowedTypes: PlotResultType[]; links: PlotResultLink[]; onChange: (links: PlotResultLink[]) => void }) {
  const t = useTranslations("plotForm");
  const labels: Record<PlotResultType, string> = { wtg: t("resultWtg"), road: t("resultRoad"), servitude: t("resultServitude"), substation: t("resultSubstation") };
  const setEnabled = (type: PlotResultType, enabled: boolean) => onChange(enabled ? [...links, { type, number: "" }] : links.filter((link) => link.type !== type));
  const setNumber = (type: PlotResultType, index: number, number: string) => {
    let currentIndex = -1;
    onChange(links.map((link) => {
      if (link.type !== type) return link;
      currentIndex += 1;
      return currentIndex === index ? { ...link, number } : link;
    }));
  };
  const removeNumber = (type: PlotResultType, index: number) => {
    let currentIndex = -1;
    onChange(links.filter((link) => {
      if (link.type !== type) return true;
      currentIndex += 1;
      return currentIndex !== index;
    }));
  };

  return <fieldset className="result-links-editor form-grid__wide"><legend>{t("resultLinks")}</legend><p>{t("resultLinksHint")}</p>{allowedTypes.map((type) => {
    const typeLinks = links.filter((link) => link.type === type);
    return <div className="result-link-row" key={type}><label className="result-link-row__toggle"><input type="checkbox" checked={typeLinks.length > 0} onChange={(event) => setEnabled(type, event.target.checked)} /><span>{labels[type]}</span></label><div className="result-link-row__numbers">{typeLinks.map((link, index) => <div key={`${type}-${index}`}><input aria-label={t("resultNumber", { type: labels[type], index: index + 1 })} required maxLength={80} value={link.number} onChange={(event) => setNumber(type, index, event.target.value)} /><button className="icon-button" type="button" onClick={() => removeNumber(type, index)} title={t("removeResultNumber", { number: link.number || index + 1 })} aria-label={t("removeResultNumber", { number: link.number || index + 1 })}><X size={16} /></button></div>)}{typeLinks.length ? <button className="result-link-row__add" type="button" onClick={() => onChange([...links, { type, number: "" }])}><Plus size={15} />{t("addResultNumber")}</button> : null}</div></div>;
  })}</fieldset>;
}
