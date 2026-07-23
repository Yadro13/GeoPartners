"use client";

import dynamic from "next/dynamic";

export const MapCanvas = dynamic(() => import("./GeoMap").then((module) => module.GeoMap), {
  ssr: false,
  loading: () => <div className="map-loading">Завантаження карти…</div>,
});
