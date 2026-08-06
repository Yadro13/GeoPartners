import type { PlotProperties } from "../data/demo.ts";
import { parsePlotResultLinks, type PlotResultType } from "./plot-result-links.ts";
import { intlLocale, type AppLocale } from "../i18n/config.ts";

export const roadOwnershipTypes = ["private", "municipal"] as const;
export type RoadOwnershipType = (typeof roadOwnershipTypes)[number];

export const servitudePaymentPeriods = ["one_time", "monthly", "yearly", "other"] as const;
export type ServitudePaymentPeriod = (typeof servitudePaymentPeriods)[number];

export function parseRoadOwnershipType(value: unknown): RoadOwnershipType | "" {
  return roadOwnershipTypes.includes(value as RoadOwnershipType) ? value as RoadOwnershipType : "";
}

export function parseServitudePaymentPeriod(value: unknown): ServitudePaymentPeriod | "" {
  return servitudePaymentPeriods.includes(value as ServitudePaymentPeriod) ? value as ServitudePaymentPeriod : "";
}

export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasResultType(properties: Pick<PlotProperties, "resultLinks">, type: PlotResultType) {
  return parsePlotResultLinks(properties.resultLinks).some((link) => link.type === type);
}

export function isFullCadastralNumber(value: string) {
  return value.replace(/\D/g, "").length === 19;
}

export function plotIdentityKey(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 19 ? `cad:${digits}` : `id:${trimmed.toLocaleLowerCase("uk")}`;
}

export function sourcePlotIdentifier(filename: string, polygonIndex = 0, polygonCount = 1) {
  const sourceStem = filename.replace(/\.(geo)?json$/i, "");
  const basename = sourceStem.split(/[\\/]/).at(-1) ?? sourceStem;
  return `${basename}${polygonCount > 1 ? `-${polygonIndex + 1}` : ""}`;
}

const detailLabels: Record<AppLocale, { area: string; ownership: string; private: string; municipal: string; term: string; payment: string; periods: Record<ServitudePaymentPeriod, string>; substationType: string; capacity: string }> = {
  uk: { area: "Площа", ownership: "Форма власності", private: "Приватна", municipal: "Комунальна", term: "Строк дії", payment: "Оплата", periods: { one_time: "разова", monthly: "щомісячна", yearly: "щорічна", other: "інше" }, substationType: "Тип", capacity: "Потужність" },
  en: { area: "Area", ownership: "Ownership", private: "Private", municipal: "Municipal", term: "Term", payment: "Payment", periods: { one_time: "one-time", monthly: "monthly", yearly: "yearly", other: "other" }, substationType: "Type", capacity: "Capacity" },
  de: { area: "Fläche", ownership: "Eigentum", private: "Privat", municipal: "Kommunal", term: "Laufzeit", payment: "Zahlung", periods: { one_time: "einmalig", monthly: "monatlich", yearly: "jährlich", other: "sonstiges" }, substationType: "Typ", capacity: "Leistung" },
};

export function formatPlotSpecialDetails(properties: PlotProperties, type: PlotResultType, locale: AppLocale) {
  const labels = detailLabels[locale];
  const values = [`${labels.area}: ${properties.areaHa.toLocaleString(intlLocale(locale), { maximumFractionDigits: 4 })} ha`];
  if (type === "road" && properties.roadOwnershipType) values.push(`${labels.ownership}: ${properties.roadOwnershipType === "private" ? labels.private : labels.municipal}`);
  if (type === "servitude") {
    const term = [properties.servitudeValidFrom, properties.servitudeValidUntil].filter(Boolean).join(" - ");
    if (term) values.push(`${labels.term}: ${term}`);
    if (properties.servitudePaymentAmount !== null && properties.servitudePaymentAmount !== undefined) {
      const amount = properties.servitudePaymentAmount.toLocaleString(intlLocale(locale), { style: "currency", currency: "UAH" });
      values.push(`${labels.payment}: ${amount}${properties.servitudePaymentPeriod ? `, ${labels.periods[properties.servitudePaymentPeriod]}` : ""}`);
    }
  }
  if (type === "substation") {
    if (properties.substationType) values.push(`${labels.substationType}: ${properties.substationType}`);
    if (properties.substationCapacityMw !== null && properties.substationCapacityMw !== undefined) values.push(`${labels.capacity}: ${properties.substationCapacityMw.toLocaleString(intlLocale(locale), { maximumFractionDigits: 3 })} MW`);
  }
  return values.join("\n");
}
