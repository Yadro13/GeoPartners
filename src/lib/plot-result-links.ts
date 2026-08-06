export const plotResultTypes = ["wtg", "road", "servitude", "substation"] as const;

export type PlotResultType = (typeof plotResultTypes)[number];
export type PlotResultLink = { type: PlotResultType; number: string };

export function parsePlotResultLinks(value: unknown): PlotResultLink[] {
  if (!Array.isArray(value)) return [];
  const result: PlotResultLink[] = [];
  const seen = new Set<PlotResultType>();

  for (const item of value.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { type?: unknown; number?: unknown };
    if (!plotResultTypes.includes(candidate.type as PlotResultType) || typeof candidate.number !== "string") continue;
    const number = candidate.number.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!number) continue;
    const type = candidate.type as PlotResultType;
    if (seen.has(type)) continue;
    seen.add(type);
    result.push({ type, number });
  }

  return result;
}
