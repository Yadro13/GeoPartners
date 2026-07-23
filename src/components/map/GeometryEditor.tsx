"use client";

import dynamic from "next/dynamic";
import type { Polygon } from "geojson";
import type { BaseMapId, PlotFeature } from "@/components/workspace/types";
import type { PlotConflict } from "@/lib/geometry";

export type GeometryChangeReason = "draw" | "edit" | "reset" | "clear";

const GeometryEditorMap = dynamic(() => import("./GeometryEditorMap").then((module) => module.GeometryEditorMap), { ssr: false, loading: () => <div className="map-loading">Завантаження редактора…</div> });

export function GeometryEditor({ geometry, initialGeometry, neighbors, conflicts, baseMap, onChange }: { geometry: Polygon | null; initialGeometry: Polygon | null; neighbors: PlotFeature[]; conflicts: PlotConflict[]; baseMap: BaseMapId; onChange: (geometry: Polygon | null, reason: GeometryChangeReason) => void }) {
  return <GeometryEditorMap geometry={geometry} initialGeometry={initialGeometry} neighbors={neighbors} conflicts={conflicts} baseMap={baseMap} onChange={onChange} />;
}
