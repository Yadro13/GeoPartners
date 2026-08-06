import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import type { category, plot } from "@/db/schema";
import { validatePolygonGeometry } from "@/lib/geometry";
import { parsePlotStatusProgress } from "@/lib/plot-status-progress";
import { parsePlotResultLinks } from "@/lib/plot-result-links";
import { nullableNumber, parseRoadOwnershipType, parseServitudePaymentPeriod } from "@/lib/plot-special-fields";

type PlotRow = typeof plot.$inferSelect;
type CategoryRow = typeof category.$inferSelect;

export function plotRowToFeature(row: PlotRow): PlotFeature {
  return { type: "Feature", geometry: row.geometry, properties: {
    id: row.id, cadastralNumber: row.cadastralNumber, name: row.name, category: row.categoryId ?? "default",
    areaHa: Number(row.areaHa), projectCapacity: Number(row.projectCapacity), status: row.status, statusProgress: parsePlotStatusProgress(row.statusProgress),
    mainCandidateCadastral: row.mainCandidateCadastral, owner: row.owner, lessee: row.lessee, documentActualAt: row.documentActualAt,
    roadOwnershipType: parseRoadOwnershipType(row.roadOwnershipType), servitudeValidFrom: row.servitudeValidFrom, servitudeValidUntil: row.servitudeValidUntil,
    servitudePaymentAmount: nullableNumber(row.servitudePaymentAmount), servitudePaymentPeriod: parseServitudePaymentPeriod(row.servitudePaymentPeriod),
    substationType: row.substationType, substationCapacityMw: nullableNumber(row.substationCapacityMw),
    resultLinks: parsePlotResultLinks(row.resultLinks),
    sourceFilename: row.sourceFilename ?? undefined, documentName: row.pdfObjectKey?.split("/").at(-1),
    documentUrl: row.pdfObjectKey ? `/api/plots/${encodeURIComponent(row.id)}/document` : undefined,
    hasDocument: Boolean(row.pdfObjectKey),
  } };
}

export function categoryRowsToRecord(rows: CategoryRow[]): Record<string, CategoryDefinition> {
  return Object.fromEntries(rows.map((row) => [row.id, { name: row.name, description: row.description, color: row.color, visible: row.visible, systemRole: row.systemRole }]));
}

export function featureToPlotValues(feature: PlotFeature) {
  const { properties } = feature;
  return {
    id: properties.id, cadastralNumber: properties.cadastralNumber, name: properties.name,
    categoryId: properties.category || "default", geometry: feature.geometry,
    areaHa: String(properties.areaHa || 0), projectCapacity: String(properties.projectCapacity || 0),
    status: properties.status ?? "", statusProgress: parsePlotStatusProgress(properties.statusProgress), mainCandidateCadastral: properties.mainCandidateCadastral ?? "",
    owner: properties.owner ?? "", lessee: properties.lessee ?? "", roadOwnershipType: parseRoadOwnershipType(properties.roadOwnershipType),
    servitudeValidFrom: properties.servitudeValidFrom ?? "", servitudeValidUntil: properties.servitudeValidUntil ?? "", servitudePaymentAmount: nullableNumber(properties.servitudePaymentAmount) === null ? null : String(nullableNumber(properties.servitudePaymentAmount)),
    servitudePaymentPeriod: parseServitudePaymentPeriod(properties.servitudePaymentPeriod), substationType: properties.substationType ?? "", substationCapacityMw: nullableNumber(properties.substationCapacityMw) === null ? null : String(nullableNumber(properties.substationCapacityMw)),
    documentActualAt: properties.documentActualAt ?? "", resultLinks: parsePlotResultLinks(properties.resultLinks), sourceFilename: properties.sourceFilename ?? null,
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
  return { ...feature, properties: { ...properties, statusProgress: parsePlotStatusProgress(properties.statusProgress), resultLinks: parsePlotResultLinks(properties.resultLinks), roadOwnershipType: parseRoadOwnershipType(properties.roadOwnershipType), servitudePaymentAmount: nullableNumber(properties.servitudePaymentAmount), servitudePaymentPeriod: parseServitudePaymentPeriod(properties.servitudePaymentPeriod), substationCapacityMw: nullableNumber(properties.substationCapacityMw) } } as PlotFeature;
}
