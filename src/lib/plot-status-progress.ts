export type PlotStatusProgress = {
  statusId: string;
  completedAt: string;
  cost: number | null;
};

const statusIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const maximumCost = 999_999_999_999.99;

export function parsePlotStatusProgress(value: unknown): PlotStatusProgress[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error("Некоректний список пройдених етапів.");

  const entries = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Некоректний запис етапу.");
    const candidate = item as Partial<PlotStatusProgress>;
    const statusId = typeof candidate.statusId === "string" ? candidate.statusId.trim() : "";
    const completedAt = typeof candidate.completedAt === "string" ? candidate.completedAt.trim() : "";
    const parsedDate = Date.parse(completedAt);
    const rawCost = (candidate as { cost?: unknown }).cost;
    const cost = rawCost === null || rawCost === undefined || rawCost === "" ? null : Number(rawCost);

    if (!statusIdPattern.test(statusId)) throw new Error("Некоректний ідентифікатор етапу.");
    if (!completedAt || !Number.isFinite(parsedDate)) throw new Error("Для пройденого етапу вкажіть коректні дату й час.");
    if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > maximumCost)) throw new Error("Витрати мають бути невід'ємною сумою у допустимому діапазоні.");

    return { statusId, completedAt: new Date(parsedDate).toISOString(), cost: cost === null ? null : Math.round(cost * 100) / 100 };
  });

  if (new Set(entries.map(({ statusId }) => statusId)).size !== entries.length) throw new Error("Кожен етап можна відзначити лише один раз.");
  return entries;
}

export function totalPlotStatusCost(entries: PlotStatusProgress[] | undefined) {
  return (entries ?? []).reduce((total, entry) => total + (entry.cost ?? 0), 0);
}
