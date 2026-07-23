"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { GeoJSON, MapContainer, Polygon as LeafletPolygon, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { MousePointer2, PenTool, RotateCcw, Trash2 } from "lucide-react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { LeafletEvent, LeafletEventHandlerFn, Polygon as LeafletPolygonLayer } from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import type { BaseMapId, PlotFeature } from "@/components/workspace/types";
import type { PlotConflict } from "@/lib/geometry";
import type { GeometryChangeReason } from "./GeometryEditor";

type EditorMode = "idle" | "draw" | "edit";
type EditorActions = { finish: () => void; cancel: () => void };

const tiles: Record<BaseMapId, { url: string; attribution: string; maxZoom: number }> = {
  streets: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 },
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 20 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri", maxZoom: 19 },
};

export function GeometryEditorMap({ geometry, initialGeometry, neighbors, conflicts, baseMap, onChange }: { geometry: Polygon | null; initialGeometry: Polygon | null; neighbors: PlotFeature[]; conflicts: PlotConflict[]; baseMap: BaseMapId; onChange: (geometry: Polygon | null, reason: GeometryChangeReason) => void }) {
  const [mode, setMode] = useState<EditorMode>("idle"); const [message, setMessage] = useState(""); const tile = tiles[baseMap];
  const editorActions = useRef<EditorActions | null>(null);
  const stopEditing = () => { editorActions.current?.finish(); setMode("idle"); };
  const cancelEditing = () => { editorActions.current?.cancel(); setMode("idle"); };
  const reset = () => { cancelEditing(); setMessage(""); onChange(initialGeometry ? structuredClone(initialGeometry) : null, "reset"); };
  const startDrawing = () => { if (mode === "edit") editorActions.current?.finish(); setMode((current) => current === "draw" ? "idle" : "draw"); };
  const toggleEditing = () => { if (mode === "edit") stopEditing(); else setMode("edit"); };
  const clear = () => { cancelEditing(); onChange(null, "clear"); };
  return <div className="geometry-editor" data-mode={mode}>
    <div className="geometry-editor__toolbar" role="toolbar" aria-label="Редактор контуру"><button type="button" data-active={mode === "draw"} onClick={startDrawing} title="Намалювати новий контур"><PenTool size={17} /><span>Новий</span></button><button type="button" data-active={mode === "edit"} disabled={!geometry} onClick={toggleEditing} title="Редагувати вершини"><MousePointer2 size={17} /><span>Вершини</span></button><button type="button" disabled={!geometry} onClick={reset} title="Скасувати зміни"><RotateCcw size={17} /><span>Скасувати</span></button><button type="button" disabled={!geometry} onClick={clear} title="Очистити контур"><Trash2 size={17} /><span>Очистити</span></button><span className="geometry-editor__status">{message || (geometry ? `${geometry.coordinates.reduce((count, ring) => count + ring.length, 0)} точок · ${neighbors.length} поруч` : `${neighbors.length} ділянок поруч`)}</span></div>
    <div className="geometry-editor__map"><MapContainer center={[49.442, 26.651]} zoom={14} zoomControl={false} attributionControl={false}><TileLayer key={baseMap} attribution={tile.attribution} url={tile.url} maxZoom={tile.maxZoom} /><ZoomControl position="bottomright" /><GeometryBridge geometry={geometry} neighbors={neighbors} conflicts={conflicts} mode={mode} editorActionsRef={editorActions} onChange={onChange} onModeChange={setMode} onMessage={setMessage} /></MapContainer></div>
  </div>;
}

function GeometryBridge({ geometry, neighbors, conflicts, mode, editorActionsRef, onChange, onModeChange, onMessage }: { geometry: Polygon | null; neighbors: PlotFeature[]; conflicts: PlotConflict[]; mode: EditorMode; editorActionsRef: MutableRefObject<EditorActions | null>; onChange: (geometry: Polygon | null, reason: GeometryChangeReason) => void; onModeChange: (mode: EditorMode) => void; onMessage: (message: string) => void }) {
  const map = useMap(); const layerRef = useRef<LeafletPolygonLayer | null>(null);
  const geometryFromLayer = useCallback((layer: LeafletPolygonLayer) => {
    const feature = layer.toGeoJSON() as Feature<Polygon>;
    return feature.geometry.type === "Polygon" ? feature.geometry : null;
  }, []);

  useEffect(() => {
    const created = (event: LeafletEvent & { layer: LeafletPolygonLayer; shape: string }) => {
      if (event.shape !== "Polygon") return;
      const layer = event.layer as LeafletPolygonLayer;
      const next = geometryFromLayer(layer); if (next) onChange(next, "draw"); map.removeLayer(layer); map.pm.disableDraw("Polygon"); onModeChange("idle"); onMessage("Новий контур готовий");
    };
    map.on("pm:create", created as LeafletEventHandlerFn);
    return () => { map.off("pm:create", created as LeafletEventHandlerFn); map.pm.disableDraw(); };
  }, [geometryFromLayer, map, onChange, onMessage, onModeChange]);

  useEffect(() => {
    if (mode === "draw") {
      layerRef.current?.pm.disable();
      map.pm.enableDraw("Polygon", { allowSelfIntersection: false, snappable: true, snapDistance: 18, finishOn: "dblclick" }); onMessage("Малювання контуру");
    } else map.pm.disableDraw();
    if (mode !== "edit") layerRef.current?.pm.disable();
  }, [map, mode, onMessage]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || mode !== "edit") return;
    const intersected = () => onMessage("Самоперетин контуру заборонено");
    layer.pm.enable({ allowSelfIntersection: false, snappable: true, snapDistance: 18 }); layer.on("pm:intersect", intersected); onMessage("Редагування вершин");
    editorActionsRef.current = {
      finish: () => { layer.pm.disable(); const next = geometryFromLayer(layer); if (next) onChange(next, "edit"); },
      cancel: () => { layer.pm.disable(); },
    };
    return () => { layer.off("pm:intersect", intersected); layer.pm.disable(); editorActionsRef.current = null; };
  }, [editorActionsRef, geometryFromLayer, mode, onChange, onMessage]);

  useEffect(() => {
    if (mode === "edit") return;
    const sources = geometry ? [geometry] : neighbors.map((plot) => plot.geometry);
    const bounds = sources.flatMap((source) => source.coordinates.flatMap((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])));
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17, animate: false });
  }, [geometry, map, mode, neighbors]);

  const conflictingIds = new Set(conflicts.map(({ plotId }) => plotId));
  return <>{neighbors.map((plot) => { const conflicting = conflictingIds.has(plot.properties.id); return <LeafletPolygon key={`${plot.properties.id}-${conflicting}`} positions={toPositions(plot.geometry)} interactive={false} pathOptions={{ className: `geometry-editor__neighbor${conflicting ? " geometry-editor__neighbor--conflict" : ""}`, color: conflicting ? "#b33a3a" : "#64746b", dashArray: "5 4", fillColor: conflicting ? "#d76363" : "#c6d0ca", fillOpacity: conflicting ? 0.16 : 0.08, weight: conflicting ? 3 : 2, pmIgnore: true, snapIgnore: false }} />; })}{conflicts.map((conflict) => <GeoJSON key={`${conflict.plotId}-${conflict.overlapAreaHa}`} data={{ type: "Feature", properties: {}, geometry: conflict.geometry } as Feature<Polygon | MultiPolygon>} interactive={false} style={{ className: "geometry-editor__conflict-area", color: "#a82020", fillColor: "#e44f4f", fillOpacity: 0.42, weight: 2, pmIgnore: true, snapIgnore: true }} />)}{geometry ? <LeafletPolygon ref={(layer) => { layerRef.current = layer; }} positions={toPositions(geometry)} pathOptions={{ color: conflicts.length ? "#b12626" : "#23754c", fillColor: conflicts.length ? "#e05b5b" : "#57c28a", fillOpacity: 0.25, weight: 3 }} /> : null}</>;
}

function toPositions(geometry: Polygon) {
  return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
}
