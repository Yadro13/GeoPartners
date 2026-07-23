import type { FeatureCollection, Polygon } from "geojson";

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
  status?: string;
  sourceFilename?: string;
  documentName?: string;
  documentUrl?: string;
  hasDocument?: boolean;
};

export type CategoryDefinition = { name: string; color: string; visible: boolean };

export const defaultCategories: Record<string, CategoryDefinition> = {
  default: { name: "Без категорії", color: "#2f86a6", visible: true },
  planned_wtg: { name: "Заплановано під ВЕУ", color: "#c67b18", visible: true },
  wtg: { name: "ВЕУ", color: "#2a9461", visible: true },
  alt_candidates: { name: "Альтернативний кандидат", color: "#8055a6", visible: true },
  roads: { name: "Дороги", color: "#66756d", visible: true },
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
        status: "Опрацювання",
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
      },
    },
  ],
};
