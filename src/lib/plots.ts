import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import type { category, plot } from "@/db/schema";
import { validatePolygonGeometry } from "@/lib/geometry";

type PlotRow = typeof plot.$inferSelect;
type CategoryRow = typeof category.$inferSelect;

export function plotRowToFeature(row: PlotRow): PlotFeature {
  return { type: "Feature", geometry: row.geometry, properties: {
    id: row.id, cadastralNumber: row.cadastralNumber, name: row.name, category: row.categoryId ?? "default",
    areaHa: Number(row.areaHa), projectCapacity: Number(row.projectCapacity), status: row.status,
    mainCandidateCadastral: row.mainCandidateCadastral, owner: row.owner, lessee: row.lessee,
    sourceFilename: row.sourceFilename ?? undefined, documentName: row.pdfObjectKey?.split("/").at(-1),
    documentUrl: row.pdfObjectKey ? `/api/plots/${encodeURIComponent(row.id)}/document` : undefined,
    hasDocument: Boolean(row.pdfObjectKey),
  } };
}

export function categoryRowsToRecord(rows: CategoryRow[]): Record<string, CategoryDefinition> {
  return Object.fromEntries(rows.map((row) => [row.id, { name: row.name, color: row.color, visible: row.visible }]));
}

export function featureToPlotValues(feature: PlotFeature) {
  const { properties } = feature;
  return {
    id: properties.id, cadastralNumber: properties.cadastralNumber, name: properties.name,
    categoryId: properties.category || "default", geometry: feature.geometry,
    areaHa: String(properties.areaHa || 0), projectCapacity: String(properties.projectCapacity || 0),
    status: properties.status ?? "", mainCandidateCadastral: properties.mainCandidateCadastral ?? "",
    owner: properties.owner ?? "", lessee: properties.lessee ?? "", sourceFilename: properties.sourceFilename ?? null,
  };
}

export function parsePlotFeature(value: unknown): PlotFeature {
  if (!value || typeof value !== "object") throw new Error("Некоректні дані ділянки.");
  const feature = value as Partial<PlotFeature>;
  const properties = feature.properties;
  if (feature.type !== "Feature" || feature.geometry?.type !== "Polygon" || !Array.isArray(feature.geometry.coordinates) || !properties) throw new Error("Потрібен GeoJSON Feature з геометрією Polygon.");
  if (!properties.id || !properties.cadastralNumber) throw new Error("ID та кадастровий номер обов'язкові.");
  const geometryErrors = validatePolygonGeometry(feature.geometry).issues.filter(({ level }) => level === "error");
  if (geometryErrors.length) throw new Error(`Некоректна геометрія: ${geometryErrors.map(({ message }) => message).join(" ")}`);
  return feature as PlotFeature;
}
