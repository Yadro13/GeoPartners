import type { FeatureCollection, Polygon } from "geojson";
import type { PlotStatusProgress } from "@/lib/plot-status-progress";
import type { PlotResultLink, PlotResultType } from "@/lib/plot-result-links";

export const categorySystemRoles = ["default", "main_candidate", "alternative_candidate", "wtg_result", "road_result", "servitude_result", "substation_result"] as const;
export type CategorySystemRole = (typeof categorySystemRoles)[number];

export type PlotProperties = {
  id: string;
  cadastralNumber: string;
  name: string;
  category: string;
  areaHa: number;
  projectCapacity: number;
  mainCandidateCadastral: string;
  owner: string;
  lessee: string;
  documentActualAt?: string;
  resultLinks?: PlotResultLink[];
  status?: string;
  statusProgress?: PlotStatusProgress[];
  sourceFilename?: string;
  documentName?: string;
  documentUrl?: string;
  hasDocument?: boolean;
};

export type CategoryDefinition = { name: string; description: string; color: string; visible: boolean; systemRole?: CategorySystemRole | null };

export const defaultCategories: Record<string, CategoryDefinition> = {
  default: { name: "Без категорії", description: "", color: "#2f86a6", visible: true, systemRole: "default" },
  planned_wtg: { name: "Основний кандидат", description: "", color: "#c67b18", visible: true, systemRole: "main_candidate" },
  wtg: { name: "ВЕУ", description: "", color: "#2a9461", visible: true, systemRole: "wtg_result" },
  alt_candidates: { name: "Альтернативний кандидат", description: "", color: "#8055a6", visible: true, systemRole: "alternative_candidate" },
  roads: { name: "Дороги", description: "", color: "#66756d", visible: true, systemRole: "road_result" },
  servitudes: { name: "Сервітути під ЛЕП", description: "", color: "#2f7990", visible: true, systemRole: "servitude_result" },
  substations: { name: "Підстанції", description: "", color: "#a44f52", visible: true, systemRole: "substation_result" },
};

export const resultTypeByCategoryRole: Partial<Record<CategorySystemRole, PlotResultType>> = {
  wtg_result: "wtg",
  road_result: "road",
  servitude_result: "servitude",
  substation_result: "substation",
};

export const categoryMeta = defaultCategories;

export const demoPlots: FeatureCollection<Polygon, PlotProperties> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[26.65297, 49.44633], [26.65294, 49.44369], [26.6529, 49.44171], [26.65147, 49.44226], [26.65157, 49.44588], [26.65297, 49.44633]]],
      },
      properties: {
        id: "demo-0018",
        cadastralNumber: "6820982100:04:051:0018",
        name: "Ділянка 0018",
        category: "default",
        areaHa: 4.7236,
        projectCapacity: 0,
        mainCandidateCadastral: "",
        owner: "Демо-власник",
        lessee: "Демо-орендар",
        documentActualAt: "2026-05-02T12:56:00",
        resultLinks: [],
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[26.64954, 49.44301], [26.65147, 49.44226], [26.6529, 49.44171], [26.65287, 49.44003], [26.64949, 49.44133], [26.64954, 49.44301]]],
      },
      properties: {
        id: "demo-0019",
        cadastralNumber: "6820982100:04:051:0019",
        name: "Ділянка 0019",
        category: "planned_wtg",
        areaHa: 4.5953,
        projectCapacity: 0,
        mainCandidateCadastral: "",
        owner: "Демо-власник",
        lessee: "Демо-орендар",
        documentActualAt: "2026-05-02T12:56:00",
        resultLinks: [{ type: "wtg", number: "1" }],
        status: "обрана ділянка як варіант",
        statusProgress: [{ statusId: "status_01", completedAt: "2026-07-22T09:30:00.000Z", cost: null }],
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[26.64949, 49.44133], [26.65287, 49.44003], [26.65283, 49.43836], [26.65283, 49.43815], [26.64944, 49.43945], [26.64949, 49.44133]]],
      },
      properties: {
        id: "demo-0020",
        cadastralNumber: "6820982100:04:051:0020",
        name: "Ділянка 0020",
        category: "alt_candidates",
        areaHa: 5.1864,
        projectCapacity: 0,
        mainCandidateCadastral: "6820982100:04:051:0019",
        owner: "Демо-власник",
        lessee: "Демо-орендар",
        documentActualAt: "2026-05-02T12:55:00",
        resultLinks: [{ type: "wtg", number: "1" }],
      },
    },
  ],
};
