"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function MapLoading() { const t = useTranslations("mapEditor"); return <div className="map-loading">{t("mapLoading")}</div>; }

export const MapCanvas = dynamic(() => import("./GeoMap").then((module) => module.GeoMap), {
  ssr: false,
  loading: MapLoading,
});
