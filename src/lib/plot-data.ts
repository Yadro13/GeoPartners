import type { FeatureCollection, Geometry, Polygon } from "geojson";
import { defaultCategories, type CategoryDefinition, type PlotProperties } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import { calculatePolygonAreaHa } from "@/lib/geometry";

type UnknownRecord = Record<string, unknown>;

export type ImportResult = {
  plots: PlotFeature[];
  categories: Record<string, CategoryDefinition>;
  skipped: string[];
};

export function normalizeImport(raw: unknown, filename = "import.geojson"): ImportResult {
  const source = isRecord(raw) ? raw : {};
  const importedCategories = normalizeCategories(source.categories);
  const candidates = source.type === "FeatureCollection" && Array.isArray(source.features)
    ? source.features
    : [source];
  const plots: PlotFeature[] = [];
  const skipped: string[] = [];

  candidates.forEach((candidate, index) => {
    try {
      const normalized = normalizeFeature(candidate, filename, index);
      plots.push(...normalized);
    } catch (error) {
      skipped.push(`${filename}, об'єкт ${index + 1}: ${error instanceof Error ? error.message : "невідома помилка"}`);
    }
  });

  return { plots, categories: importedCategories, skipped };
}

function normalizeFeature(raw: unknown, filename: string, index: number): PlotFeature[] {
  if (!isRecord(raw)) throw new Error("об'єкт не є GeoJSON");
  const geometry = extractGeometry(raw);
  const properties = isRecord(raw.properties) ? raw.properties : {};
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : geometry.type === "LineString"
        ? [[closeRing(geometry.coordinates)]]
      : [];
  if (!polygons.length) throw new Error("підтримуються Polygon, MultiPolygon і замкнений LineString");

  return polygons.map((coordinates, polygonIndex) => {
    validateCoordinates(coordinates);
    const geometry: Polygon = { type: "Polygon", coordinates };
    const sourceStem = filename.replace(/\.(geo)?json$/i, "");
    const cadastral = textValue(properties.cadastralNumber ?? properties.cadastral_number)
      || formatCadastral(sourceStem)
      || `Без номера ${index + 1}${polygons.length > 1 ? `.${polygonIndex + 1}` : ""}`;
    const id = textValue(properties.id) || makeId();
    return {
      type: "Feature",
      geometry,
      properties: {
        id: polygons.length > 1 ? `${id}-${polygonIndex + 1}` : id,
        cadastralNumber: cadastral,
        name: textValue(properties.name) || `Ділянка ${cadastral}`,
        category: textValue(properties.category) || "default",
        areaHa: positiveNumber(properties.areaHa ?? properties.area_ha ?? areaFromSquareMeters(properties.area_sqm)) || calculatePolygonAreaHa(geometry),
        projectCapacity: numberValue(properties.projectCapacity ?? properties.project_capacity),
        mainCandidateCadastral: textValue(properties.mainCandidateCadastral ?? properties.main_candidate_cadastral),
        owner: textValue(properties.owner),
        lessee: textValue(properties.lessee),
        status: textValue(properties.status),
        sourceFilename: textValue(properties.sourceFilename) || sourceStem,
      },
    };
  });
}

function extractGeometry(raw: UnknownRecord): Geometry {
  const geometry = isRecord(raw.geometry) ? raw.geometry : raw;
  if ((geometry.type !== "Polygon" && geometry.type !== "MultiPolygon" && geometry.type !== "LineString") || !Array.isArray(geometry.coordinates)) {
    throw new Error("геометрію не знайдено");
  }
  return geometry as unknown as Geometry;
}

function closeRing(points: number[][]) {
  if (points.length < 3) return points;
  const first = points[0]; const last = points.at(-1);
  return last && first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

function validateCoordinates(coordinates: number[][][]) {
  if (!coordinates.length || !coordinates[0] || coordinates[0].length < 4) throw new Error("контур має містити щонайменше 4 точки");
  for (const ring of coordinates) {
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite)) throw new Error("некоректні координати");
      if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("координати мають бути у WGS84");
    }
  }
}

function normalizeCategories(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
    if (!isRecord(item)) return [];
    return [[id, {
      name: textValue(item.name) || id,
      color: /^#[0-9a-f]{6}$/i.test(textValue(item.color)) ? textValue(item.color) : "#2f86a6",
      visible: item.visible !== false,
    } satisfies CategoryDefinition]];
  }));
}

export function toFeatureCollection(plots: PlotFeature[], categories: Record<string, CategoryDefinition>): FeatureCollection<Polygon, PlotProperties> & { categories: Record<string, CategoryDefinition> } {
  return { type: "FeatureCollection", categories, features: plots };
}

export function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function plotsToCsv(plots: PlotFeature[]) {
  const rows = [
    ["Кадастровий номер", "Назва", "Категорія", "Площа, га", "Власник", "Орендар", "Статус"],
    ...plots.map(({ properties }) => [properties.cadastralNumber, properties.name, properties.category, properties.areaHa, properties.owner, properties.lessee, properties.status ?? ""]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function categoriesWithDefaults(categories: Record<string, CategoryDefinition>) {
  return { ...defaultCategories, ...categories };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatCadastral(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 19 ? `${digits.slice(0, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 15)}:${digits.slice(15)}` : "";
}

function areaFromSquareMeters(value: unknown) {
  const area = Number(value);
  return Number.isFinite(area) ? area / 10000 : 0;
}

function textValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function positiveNumber(value: unknown) { const parsed = numberValue(value); return parsed > 0 ? parsed : 0; }
function isRecord(value: unknown): value is UnknownRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function makeId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `plot-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
