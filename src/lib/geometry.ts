import area from "@turf/area";
import booleanValid from "@turf/boolean-valid";
import distance from "@turf/distance";
import intersect from "@turf/intersect";
import kinks from "@turf/kinks";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { PlotFeature } from "@/components/workspace/types";

export type PlotConflict = {
  plotId: string;
  cadastralNumber: string;
  overlapAreaHa: number;
  overlapAreaSquareMeters: number;
  scale: "micro" | "material";
  geometry: Polygon | MultiPolygon;
};

export type GeometryValidationIssue = {
  level: "warning" | "error";
  code: "ring" | "coordinates" | "duplicate" | "self-intersection" | "ogc" | "short-segment";
  message: string;
};

export type GeometryValidationMarker = {
  level: "warning" | "error";
  message: string;
  coordinates: [number, number];
};

export type GeometryValidation = { issues: GeometryValidationIssue[]; markers: GeometryValidationMarker[] };

export type GeometryRepairAction = {
  code: "close-rings" | "remove-duplicates";
  count: number;
  message: string;
};

export type GeometryRepair = { geometry: Polygon; actions: GeometryRepairAction[] };

const MIN_SEGMENT_METERS = 0.05;
export const MIN_OVERLAP_SQUARE_METERS = 0.01;
export const MICRO_OVERLAP_SQUARE_METERS = 1;

export function calculatePolygonAreaHa(geometry: Polygon) {
  const hectares = area(geometry) / 10_000;
  return Math.round(hectares * 10_000) / 10_000;
}

export function findPlotConflicts(geometry: Polygon, neighbors: PlotFeature[]) {
  const subject: Feature<Polygon> = { type: "Feature", properties: {}, geometry };
  return neighbors.flatMap<PlotConflict>((plot) => {
    const features: FeatureCollection<Polygon | MultiPolygon> = { type: "FeatureCollection", features: [subject, { type: "Feature", properties: {}, geometry: plot.geometry }] };
    const overlap = intersect(features);
    if (!overlap) return [];
    const overlapSquareMeters = area(overlap);
    if (overlapSquareMeters <= MIN_OVERLAP_SQUARE_METERS) return [];
    return [{
      plotId: plot.properties.id,
      cadastralNumber: plot.properties.cadastralNumber,
      overlapAreaHa: Math.round((overlapSquareMeters / 10_000) * 1_000_000) / 1_000_000,
      overlapAreaSquareMeters: overlapSquareMeters,
      scale: overlapSquareMeters <= MICRO_OVERLAP_SQUARE_METERS ? "micro" : "material",
      geometry: overlap.geometry,
    }];
  });
}

export function validatePolygonGeometry(geometry: Polygon): GeometryValidation {
  const issues: GeometryValidationIssue[] = []; const markers: GeometryValidationMarker[] = [];
  let duplicateCount = 0; let shortSegmentCount = 0; let shortestSegment = Number.POSITIVE_INFINITY; let topologyReady = true;

  if (!geometry.coordinates.length) return { issues: [{ level: "error", code: "ring", message: "Контур не містить кілець." }], markers };

  geometry.coordinates.forEach((ring, ringIndex) => {
    const ringName = ringIndex === 0 ? "Зовнішнє кільце" : `Внутрішнє кільце ${ringIndex}`;
    if (ring.length < 4) { issues.push({ level: "error", code: "ring", message: `${ringName} має містити щонайменше 4 координати.` }); topologyReady = false; return; }

    const valid = ring.every((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (!valid) { issues.push({ level: "error", code: "coordinates", message: `${ringName} містить некоректні координати.` }); topologyReady = false; return; }
    const inWgs84 = ring.every(([lng, lat]) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90);
    if (!inWgs84) { issues.push({ level: "error", code: "coordinates", message: `${ringName} містить координати поза межами WGS84.` }); topologyReady = false; return; }

    const first = ring[0] as [number, number]; const last = ring.at(-1) as [number, number]; const closed = samePosition(first, last);
    if (!closed) {
      issues.push({ level: "error", code: "ring", message: `${ringName} не замкнене: перша й остання координати мають збігатися.` });
      markers.push({ level: "error", message: `${ringName}: початок`, coordinates: first }, { level: "error", message: `${ringName}: незамкнений кінець`, coordinates: last }); topologyReady = false;
    }

    const seen = new Map<string, number>(); const vertexCount = closed ? ring.length - 1 : ring.length;
    for (let index = 0; index < vertexCount; index++) {
      const point = ring[index] as [number, number]; const key = `${point[0]}:${point[1]}`; const previous = seen.get(key);
      if (previous !== undefined) { duplicateCount += 1; markers.push({ level: "error", message: `${ringName}: вершина ${index + 1} дублює вершину ${previous + 1}`, coordinates: point }); topologyReady = false; }
      else seen.set(key, index);
    }

    for (let index = 1; index < ring.length; index++) {
      const from = ring[index - 1] as [number, number]; const to = ring[index] as [number, number];
      if (samePosition(from, to)) continue;
      const length = distance(from, to, { units: "meters" });
      if (length < MIN_SEGMENT_METERS) { shortSegmentCount += 1; shortestSegment = Math.min(shortestSegment, length); if (markers.length < 40) markers.push({ level: "warning", message: `Короткий сегмент: ${formatMeters(length)}`, coordinates: midpoint(from, to) }); }
    }
  });

  if (duplicateCount) issues.push({ level: "error", code: "duplicate", message: `Повторюваних вершин: ${duplicateCount}.` });
  if (shortSegmentCount) issues.push({ level: "warning", code: "short-segment", message: `Сегментів коротших за ${formatMeters(MIN_SEGMENT_METERS)}: ${shortSegmentCount}; мінімальний - ${formatMeters(shortestSegment)}.` });

  if (topologyReady) {
    const selfIntersections = kinks({ type: "Feature", properties: {}, geometry }).features;
    if (selfIntersections.length) {
      issues.push({ level: "error", code: "self-intersection", message: `Самоперетинів контуру: ${selfIntersections.length}.` });
      for (const point of selfIntersections) markers.push({ level: "error", message: "Самоперетин контуру", coordinates: point.geometry.coordinates as [number, number] });
    }
    if (!booleanValid(geometry) && !selfIntersections.length) issues.push({ level: "error", code: "ogc", message: "Геометрія не відповідає правилам OGC для Polygon." });
  }

  return { issues, markers: deduplicateMarkers(markers) };
}

export function repairPolygonGeometry(geometry: Polygon): GeometryRepair {
  let closedRings = 0; let removedDuplicates = 0;
  const coordinates = geometry.coordinates.map((ring) => {
    const valid = ring.length >= 3 && ring.every((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90);
    if (!valid) return ring.map((point) => [...point]);

    const originallyClosed = samePosition(ring[0] as [number, number], ring.at(-1) as [number, number]);
    const source = originallyClosed ? ring.slice(0, -1) : ring;
    const seen = new Set<string>(); const vertices: number[][] = []; let ringRemoved = 0;
    for (const point of source) {
      const key = `${point[0]}:${point[1]}`;
      if (seen.has(key)) { ringRemoved += 1; continue; }
      seen.add(key); vertices.push([...point]);
    }
    if (vertices.length < 3) return ring.map((point) => [...point]);
    removedDuplicates += ringRemoved;
    if (!originallyClosed) closedRings += 1;
    return [...vertices, [...vertices[0]]];
  });

  const actions: GeometryRepairAction[] = [];
  if (closedRings) actions.push({ code: "close-rings", count: closedRings, message: `Замкнути кілець: ${closedRings}` });
  if (removedDuplicates) actions.push({ code: "remove-duplicates", count: removedDuplicates, message: `Видалити точні дублікати вершин: ${removedDuplicates}` });
  return { geometry: { type: "Polygon", coordinates }, actions };
}

function samePosition(left: [number, number], right: [number, number]) { return left[0] === right[0] && left[1] === right[1]; }
function midpoint(left: [number, number], right: [number, number]): [number, number] { return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2]; }
function formatMeters(value: number) { return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 3 })} м`; }
function deduplicateMarkers(markers: GeometryValidationMarker[]) { const unique = new Map<string, GeometryValidationMarker>(); for (const marker of markers) unique.set(`${marker.level}:${marker.coordinates.join(":")}:${marker.message}`, marker); return [...unique.values()]; }
