"use client";

import { useEffect, useMemo } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { CategoryDefinition, PlotProperties } from "@/data/demo";
import type { PlotFeature, BaseMapId } from "@/components/workspace/types";
import type { GeometryValidationMarker } from "@/lib/geometry";

type GeoMapProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  plots: PlotFeature[];
  categories: Record<string, CategoryDefinition>;
  baseMap: BaseMapId;
  conflictIds?: string[];
  overlapFeatures?: Feature<Polygon | MultiPolygon>[];
  validationMarkers?: GeometryValidationMarker[];
};

function FitPlots({ plots }: { plots: PlotFeature[] }) {
  const map = useMap();

  useEffect(() => {
    const bounds = plots.flatMap((feature) => feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]));
    if (bounds.length) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [map, plots]);

  return null;
}

const tiles: Record<BaseMapId, { url: string; attribution: string; maxZoom: number }> = {
  streets: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 },
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 20 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri", maxZoom: 19 },
};

export function GeoMap({ selectedId, onSelect, compact = false, plots, categories, baseMap, conflictIds = [], overlapFeatures = [], validationMarkers = [] }: GeoMapProps) {
  const conflictSet = useMemo(() => new Set(conflictIds), [conflictIds]);
  const visiblePlots = useMemo(() => plots.filter(({ properties }) => categories[properties.category]?.visible !== false || conflictSet.has(properties.id)), [categories, conflictSet, plots]);
  const geometryKey = useMemo(() => visiblePlots.map(({ geometry, properties }) => `${properties.id}:${geometry.coordinates.flat(2).join(",")}`).join("|"), [visiblePlots]);
  const dataKey = useMemo(() => `${selectedId ?? "none"}-${compact}-${conflictIds.join("-")}-${geometryKey}`, [compact, conflictIds, geometryKey, selectedId]);
  const tile = tiles[baseMap];

  const style = (feature?: Feature): PathOptions => {
    const properties = feature?.properties as PlotProperties | undefined;
    const conflicting = Boolean(properties && conflictSet.has(properties.id));
    const comparisonCurrent = properties?.category === "version-current";
    const color = conflicting ? "#9a650c" : properties ? (categories[properties.category]?.color ?? categories.default?.color ?? "#2f86a6") : "#2f86a6";
    const selected = properties?.id === selectedId;
    return {
      color,
      fillColor: color,
      dashArray: comparisonCurrent ? "6 4" : undefined,
      fillOpacity: comparisonCurrent ? 0.06 : conflicting ? 0.34 : selected ? 0.42 : 0.2,
      weight: selected || conflicting ? 4 : comparisonCurrent ? 3 : 2,
    };
  };

  return (
    <MapContainer center={[49.442, 26.651]} zoom={14} zoomControl={false} attributionControl={!compact}>
      <TileLayer
        key={baseMap}
        attribution={tile.attribution}
        url={tile.url}
        maxZoom={tile.maxZoom}
      />
      <ZoomControl position={compact ? "topright" : "bottomright"} />
      <GeoJSON
        key={dataKey}
        data={{ type: "FeatureCollection", features: visiblePlots } as FeatureCollection<Polygon, PlotProperties>}
        style={style}
        onEachFeature={(feature, layer) => {
          layer.on("click", () => onSelect(feature.properties.id));
          layer.bindTooltip(feature.properties.cadastralNumber, { sticky: true, direction: "top" });
        }}
      />
      {overlapFeatures.length ? <GeoJSON key={`overlaps-${overlapFeatures.length}-${dataKey}`} data={{ type: "FeatureCollection", features: overlapFeatures } as FeatureCollection<Polygon | MultiPolygon>} interactive={false} style={{ className: "map-conflict-area", color: "#8a5b08", dashArray: "3 3", fillColor: "#f2b642", fillOpacity: 0.46, weight: 2 }} /> : null}
      {validationMarkers.map((marker, index) => <CircleMarker key={`${marker.level}-${marker.coordinates.join("-")}-${index}`} center={[marker.coordinates[1], marker.coordinates[0]]} radius={marker.level === "error" ? 7 : 5} pathOptions={{ className: `map-validation-marker map-validation-marker--${marker.level}`, color: marker.level === "error" ? "#8f1f1f" : "#8a5b08", fillColor: marker.level === "error" ? "#ef4e4e" : "#f2b642", fillOpacity: 0.88, weight: 2 }}><Tooltip direction="top">{marker.message}</Tooltip></CircleMarker>)}
      <FitPlots plots={visiblePlots} />
    </MapContainer>
  );
}
