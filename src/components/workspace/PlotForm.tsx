"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { Polygon } from "geojson";
import { resultTypeByCategoryRole, type CategoryDefinition } from "@/data/demo";
import { GeometryEditor, type GeometryChangeReason } from "@/components/map/GeometryEditor";
import { calculatePolygonAreaHa, findPlotConflicts, validatePolygonGeometry } from "@/lib/geometry";
import { parsePlotResultLinks, plotResultTypes, type PlotResultLink, type PlotResultType } from "@/lib/plot-result-links";
import { isFullCadastralNumber, nullableNumber, parseRoadOwnershipType, parseServitudePaymentPeriod, servitudePaymentPeriods } from "@/lib/plot-special-fields";
import { areaUnit, normalizeDocumentDate } from "@/lib/localized-values";
import type { BaseMapId, PlotFeature } from "./types";

export function PlotForm({ plot, neighbors, categories, baseMap, onSave, onDelete, onCancel }: { plot: PlotFeature | null; neighbors: PlotFeature[]; categories: Record<string, CategoryDefinition>; baseMap: BaseMapId; onSave: (plot: PlotFeature, relatedPlots?: PlotFeature[]) => Promise<void>; onDelete?: () => void; onCancel: () => void }) {
  const t = useTranslations("plotForm");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const initial = useMemo(() => plot?.properties ?? { id: crypto.randomUUID(), cadastralNumber: "", name: "", category: "default", areaHa: 0, projectCapacity: 0, mainCandidateCadastral: "", owner: "", lessee: "", roadOwnershipType: "" as const, servitudeValidFrom: "", servitudeValidUntil: "", servitudePaymentAmount: null, servitudePaymentPeriod: "" as const, substationType: "", substationCapacityMw: null, documentActualAt: "", resultLinks: [], status: "", statusProgress: [] }, [plot]);
  const initialGeometry = useMemo(() => plot?.geometry ? structuredClone(plot.geometry) : null, [plot]);
  const [geometry, setGeometry] = useState<Polygon | null>(initialGeometry);
  const [geometryText, setGeometryText] = useState(initialGeometry ? JSON.stringify(initialGeometry, null, 2) : "");
  const [areaHa, setAreaHa] = useState(String(initial.areaHa));
  const [categoryId, setCategoryId] = useState(initial.category);
  const [resultLinks, setResultLinks] = useState<PlotResultLink[]>(() => parsePlotResultLinks(initial.resultLinks));
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string[]>>({});
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
      const next: PlotFeature = { type: "Feature", geometry: parsed, properties: { ...initial, cadastralNumber: String(data.get("cadastralNumber") ?? "").trim(), name: initial.name, category: categoryId, areaHa: Number(data.get("areaHa")) || 0, owner: String(data.get("owner") ?? "").trim(), lessee: String(data.get("lessee") ?? "").trim(), roadOwnershipType: isRoadResult ? parseRoadOwnershipType(data.get("roadOwnershipType")) : initial.roadOwnershipType, servitudeValidFrom: isServitudeResult ? String(data.get("servitudeValidFrom") ?? "").trim() : initial.servitudeValidFrom, servitudeValidUntil: isServitudeResult ? String(data.get("servitudeValidUntil") ?? "").trim() : initial.servitudeValidUntil, servitudePaymentAmount: isServitudeResult ? nullableNumber(data.get("servitudePaymentAmount")) : initial.servitudePaymentAmount, servitudePaymentPeriod: isServitudeResult ? parseServitudePaymentPeriod(data.get("servitudePaymentPeriod")) : initial.servitudePaymentPeriod, substationType: isSubstationResult ? String(data.get("substationType") ?? "").trim() : initial.substationType, substationCapacityMw: isSubstationResult ? nullableNumber(data.get("substationCapacityMw")) : initial.substationCapacityMw, documentActualAt: normalizeDocumentDate(data.get("documentActualAt")), resultLinks: parsePlotResultLinks(resultLinks) } };
      if (!next.properties.cadastralNumber) throw new Error(t("cadastralRequired"));
      if (isRoadResult && !next.properties.roadOwnershipType) throw new Error(t("roadOwnershipRequired"));
      if (isRoadResult && next.properties.roadOwnershipType === "private" && !isFullCadastralNumber(next.properties.cadastralNumber)) throw new Error(t("privateRoadCadastralRequired"));
      if (isRoadResult && next.properties.roadOwnershipType === "private" && !next.properties.owner) throw new Error(t("privateRoadOwnerRequired"));
      if (isServitudeResult && (next.properties.servitudePaymentAmount ?? 0) < 0) throw new Error(t("paymentNonNegative"));
      if (isSubstationResult && (next.properties.substationCapacityMw ?? 0) < 0) throw new Error(t("capacityNonNegative"));
      const candidateUpdates = buildCandidateUpdates(neighbors, categories, resultLinks, groupAssignments);
      setSaving(true); await onSave(next, candidateUpdates);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("saveFailed")); setSaving(false); }
  };

  const allowedTypes = resultTypesForCategory(categories[categoryId]);
  const categoryRole = categories[categoryId]?.systemRole;
  const isRoadResult = categoryRole === "road_result";
  const isServitudeResult = categoryRole === "servitude_result";
  const isSubstationResult = categoryRole === "substation_result";
  const changeCategory = (nextId: string) => {
    const nextAllowed = new Set(resultTypesForCategory(categories[nextId]));
    const incompatible = resultLinks.filter(({ type }) => !nextAllowed.has(type));
    if (incompatible.length && !window.confirm(t("confirmRemoveResultLinks"))) return;
    if (incompatible.length) setResultLinks((current) => current.filter(({ type }) => nextAllowed.has(type)));
    setCategoryId(nextId);
  };

  return <form className="plot-form" onSubmit={submit}><div className="form-grid">
    <label>{t("cadastralNumber")}<input name="cadastralNumber" defaultValue={initial.cadastralNumber} required /></label><label>{t("category")}<select name="category" value={categoryId} onChange={(event) => changeCategory(event.target.value)}>{Object.entries(categories).map(([id, category]) => <option key={id} value={id}>{category.name}</option>)}</select></label>
    <label><span className="form-label-row"><span>{t("areaHa")}</span>{areaCalculated ? <small>{t("fromOutline")}</small> : null}</span><input name="areaHa" type="number" min="0" step="0.0001" value={areaHa} onChange={(event) => { setAreaHa(event.target.value); setAreaCalculated(false); }} /></label><label>{t("documentActualAt")}<input name="documentActualAt" type="date" defaultValue={normalizeDocumentDate(initial.documentActualAt)} /></label>
    {allowedTypes.length ? <ResultLinksEditor allowedTypes={allowedTypes} links={resultLinks} neighbors={neighbors} categories={categories} category={categories[categoryId]} canManageGroup={Boolean(plot)} assignments={groupAssignments} onAssignmentsChange={setGroupAssignments} onChange={setResultLinks} /> : null}
    {isRoadResult ? <fieldset className="specialized-fields form-grid__wide"><legend>{t("roadParameters")}</legend><div className="specialized-fields__grid"><label>{t("roadOwnershipType")}<select name="roadOwnershipType" defaultValue={initial.roadOwnershipType ?? ""}><option value="">{t("notSelected")}</option><option value="private">{t("roadPrivate")}</option><option value="municipal">{t("roadMunicipal")}</option></select></label><p>{t("roadIdentifierHint")}</p></div></fieldset> : null}
    {isServitudeResult ? <fieldset className="specialized-fields form-grid__wide"><legend>{t("servitudeParameters")}</legend><div className="specialized-fields__grid"><label>{t("validFrom")}<input name="servitudeValidFrom" type="date" defaultValue={initial.servitudeValidFrom ?? ""} /></label><label>{t("validUntil")}<input name="servitudeValidUntil" type="date" defaultValue={initial.servitudeValidUntil ?? ""} /></label><label>{t("paymentAmount")}<input name="servitudePaymentAmount" type="number" min="0" step="0.01" defaultValue={initial.servitudePaymentAmount ?? ""} /></label><label>{t("paymentPeriod")}<select name="servitudePaymentPeriod" defaultValue={initial.servitudePaymentPeriod ?? ""}><option value="">{t("notSelected")}</option>{servitudePaymentPeriods.map((period) => <option key={period} value={period}>{t(`paymentPeriod_${period}`)}</option>)}</select></label></div></fieldset> : null}
    {isSubstationResult ? <fieldset className="specialized-fields form-grid__wide"><legend>{t("substationParameters")}</legend><div className="specialized-fields__grid"><label>{t("substationType")}<input name="substationType" defaultValue={initial.substationType ?? ""} maxLength={160} /></label><label>{t("substationCapacity")}<input name="substationCapacityMw" type="number" min="0" step="0.001" defaultValue={initial.substationCapacityMw ?? ""} /></label></div></fieldset> : null}
    <label>{t("owner")}<textarea name="owner" rows={2} defaultValue={initial.owner} /></label><label>{t("lessee")}<textarea name="lessee" rows={2} defaultValue={initial.lessee} /></label>
    <div className="form-grid__wide"><GeometryEditor geometry={geometry} initialGeometry={initialGeometry} neighbors={neighbors} conflicts={conflicts} baseMap={baseMap} onChange={updateGeometry} />{conflicts.length ? <div className="geometry-conflicts" role="status"><AlertTriangle size={19} /><div><strong>{t("overlapAllowed")}</strong><span>{t("overlapInfo")}</span>{conflicts.map((conflict) => <span key={conflict.plotId}>{conflict.cadastralNumber} · {conflict.overlapAreaHa < 0.0001 ? `< 0.0001 ${areaUnit(locale)}` : `${format.number(conflict.overlapAreaHa, { maximumFractionDigits: 6 })} ${areaUnit(locale)}`}</span>)}</div></div> : null}</div>
    <details className="geometry-source form-grid__wide"><summary>{t("geometry")}</summary><label>GeoJSON<textarea name="geometry" rows={7} placeholder='{"type":"Polygon","coordinates":[...]}' value={geometryText} onChange={(event) => { const value = event.target.value; setGeometryText(value); try { const parsed = JSON.parse(value) as Polygon; if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) updateGeometry(parsed, "manual"); } catch { /* Submit reports incomplete JSON. */ } }} spellCheck={false} /></label></details>
  </div>{error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions">{plot && onDelete ? <button className="danger-button" type="button" onClick={onDelete}><Trash2 size={17} />{common("delete")}</button> : <span />}<button type="button" onClick={onCancel}>{common("cancel")}</button><button className="command-button--primary" disabled={saving} type="submit"><Save size={17} />{saving ? common("saving") : common("save")}</button></footer></form>;
}

function resultTypesForCategory(category?: CategoryDefinition): PlotResultType[] {
  if (category?.systemRole === "main_candidate" || category?.systemRole === "alternative_candidate") return [...plotResultTypes];
  const resultType = category?.systemRole ? resultTypeByCategoryRole[category.systemRole] : undefined;
  return resultType ? [resultType] : [];
}

function ResultLinksEditor({ allowedTypes, links, neighbors, categories, category, canManageGroup, assignments, onAssignmentsChange, onChange }: { allowedTypes: PlotResultType[]; links: PlotResultLink[]; neighbors: PlotFeature[]; categories: Record<string, CategoryDefinition>; category?: CategoryDefinition; canManageGroup: boolean; assignments: Record<string, string[]>; onAssignmentsChange: (assignments: Record<string, string[]>) => void; onChange: (links: PlotResultLink[]) => void }) {
  const t = useTranslations("plotForm");
  const labels: Record<PlotResultType, string> = { wtg: t("resultWtg"), road: t("resultRoad"), servitude: t("resultServitude"), substation: t("resultSubstation") };
  const setNumber = (type: PlotResultType, number: string) => {
    const existing = links.some((link) => link.type === type);
    if (!number) return onChange(links.filter((link) => link.type !== type));
    onChange(existing ? links.map((link) => link.type === type ? { ...link, number } : link) : [...links, { type, number }]);
  };

  return <div className="result-number-fields form-grid__wide">{allowedTypes.map((type) => {
    const link = links.find((item) => item.type === type);
    const managesGroup = canManageGroup && category?.systemRole ? resultTypeByCategoryRole[category.systemRole] === type : false;
    const number = link?.number ?? "";
    const key = resultLinkKey(type, number);
    const defaultSelection = matchingCandidates(type, number, neighbors, categories).map(({ properties }) => properties.id);
    const selectedIds = assignments[key] ?? defaultSelection;
    return <div className="result-number-field" key={type}><label>{t("resultNumber", { type: labels[type] })}<input maxLength={80} value={number} onChange={(event) => setNumber(type, event.target.value)} /></label>{number.trim() ? <>
      <ResultLinkMatches type={type} number={number} plots={neighbors} categories={categories} />{managesGroup ? <ResultGroupEditor typeLabel={labels[type]} number={number} plots={neighbors} categories={categories} selectedIds={selectedIds} onChange={(ids) => onAssignmentsChange({ ...assignments, [key]: ids })} /> : null}
    </> : null}</div>;
  })}</div>;
}

function ResultLinkMatches({ type, number, plots, categories }: { type: PlotResultType; number: string; plots: PlotFeature[]; categories: Record<string, CategoryDefinition> }) {
  const t = useTranslations("plotForm");
  const normalized = number.trim().toLocaleLowerCase();
  if (!normalized) return null;
  const matches = plots.filter((plot) => parsePlotResultLinks(plot.properties.resultLinks).some((link) => link.type === type && link.number.toLocaleLowerCase() === normalized));
  if (!matches.length) return <small className="result-link-matches result-link-matches--empty">{t("noLinkedPlots")}</small>;
  const roleLabels = { main_candidate: t("matchMain"), alternative_candidate: t("matchAlternative"), wtg_result: t("matchFinal"), road_result: t("matchFinal"), servitude_result: t("matchFinal"), substation_result: t("matchFinal") } as const;
  return <div className="result-link-matches">{matches.map((plot) => {
    const role = categories[plot.properties.category]?.systemRole;
    const label = role && role in roleLabels ? roleLabels[role as keyof typeof roleLabels] : categories[plot.properties.category]?.name ?? t("matchRelated");
    return <span key={plot.properties.id}><strong>{label}</strong>{plot.properties.cadastralNumber}</span>;
  })}</div>;
}

function ResultGroupEditor({ typeLabel, number, plots, categories, selectedIds, onChange }: { typeLabel: string; number: string; plots: PlotFeature[]; categories: Record<string, CategoryDefinition>; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("plotForm");
  const mainCandidates = plots.filter((plot) => categories[plot.properties.category]?.systemRole === "main_candidate");
  const alternativeCandidates = plots.filter((plot) => categories[plot.properties.category]?.systemRole === "alternative_candidate");
  const selected = new Set(selectedIds);
  const selectedMain = mainCandidates.find(({ properties }) => selected.has(properties.id))?.properties.id ?? "";
  const selectedAlternativeCount = alternativeCandidates.filter(({ properties }) => selected.has(properties.id)).length;
  const setMain = (id: string) => onChange([...selectedIds.filter((candidateId) => !mainCandidates.some(({ properties }) => properties.id === candidateId)), ...(id ? [id] : [])]);
  const toggleAlternative = (id: string, enabled: boolean) => onChange(enabled ? [...selectedIds, id] : selectedIds.filter((candidateId) => candidateId !== id));

  return <details className="result-group-editor"><summary>{t("groupComposition", { type: typeLabel, number, count: selectedIds.length })}</summary><div><label>{t("groupMainCandidate")}<select value={selectedMain} onChange={(event) => setMain(event.target.value)}><option value="">{t("notSelected")}</option>{mainCandidates.map(({ properties }) => <option key={properties.id} value={properties.id}>{properties.cadastralNumber}</option>)}</select></label><fieldset><legend>{t("groupAlternativeCandidates", { count: selectedAlternativeCount })}</legend>{alternativeCandidates.length ? <div className="result-group-editor__alternatives">{alternativeCandidates.map(({ properties }) => <label key={properties.id}><input type="checkbox" checked={selected.has(properties.id)} onChange={(event) => toggleAlternative(properties.id, event.target.checked)} /><span>{properties.cadastralNumber}</span></label>)}</div> : <small>{t("noAlternativeCandidates")}</small>}</fieldset></div></details>;
}

function matchingCandidates(type: PlotResultType, number: string, plots: PlotFeature[], categories: Record<string, CategoryDefinition>) {
  const normalized = number.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return plots.filter((plot) => {
    const role = categories[plot.properties.category]?.systemRole;
    return (role === "main_candidate" || role === "alternative_candidate") && parsePlotResultLinks(plot.properties.resultLinks).some((link) => link.type === type && link.number.toLocaleLowerCase() === normalized);
  });
}

function buildCandidateUpdates(plots: PlotFeature[], categories: Record<string, CategoryDefinition>, links: PlotResultLink[], assignments: Record<string, string[]>) {
  const updates = new Map<string, PlotFeature>();
  for (const link of links) {
    const key = resultLinkKey(link.type, link.number);
    if (!(key in assignments)) continue;
    const selected = new Set(assignments[key]);
    for (const plot of plots) {
      const role = categories[plot.properties.category]?.systemRole;
      if (role !== "main_candidate" && role !== "alternative_candidate") continue;
      const current = parsePlotResultLinks(plot.properties.resultLinks);
      const hasLink = current.some((item) => resultLinkKey(item.type, item.number) === key);
      const shouldHaveLink = selected.has(plot.properties.id);
      if (hasLink === shouldHaveLink) continue;
      const resultLinks = shouldHaveLink ? [...current.filter((item) => item.type !== link.type), link] : current.filter((item) => resultLinkKey(item.type, item.number) !== key);
      updates.set(plot.properties.id, { ...plot, properties: { ...plot.properties, resultLinks: parsePlotResultLinks(resultLinks) } });
    }
  }
  return [...updates.values()];
}

function resultLinkKey(type: PlotResultType, number: string) {
  return `${type}:${number.trim().toLocaleLowerCase()}`;
}
