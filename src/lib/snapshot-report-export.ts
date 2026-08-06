import type { SnapshotKpis } from "./snapshot-report";
import type { WorkspaceSnapshotPayload } from "./workspace-snapshot-format";

type SnapshotExportInput = { capturedAt: string | Date; payload: WorkspaceSnapshotPayload; kpis: SnapshotKpis };

const labels = {
  uk: { title: "Історичний звіт", generated: "Сформовано", snapshot: "Стан на", database: "База", production: "Робоча", sandbox: "Тестова", plots: "Ділянки", categories: "Категорії", stages: "Підсумки за етапами", stage: "Етап", current: "Поточна кількість", change: "Зміна до попереднього знімка", first: "Перший знімок" },
  en: { title: "Historical report", generated: "Generated", snapshot: "Snapshot at", database: "Database", production: "Production", sandbox: "Test", plots: "Plots", categories: "Categories", stages: "Stage totals", stage: "Stage", current: "Current count", change: "Change from previous snapshot", first: "First snapshot" },
  de: { title: "Historischer Bericht", generated: "Erstellt", snapshot: "Stand vom", database: "Datenbank", production: "Produktiv", sandbox: "Test", plots: "Flächen", categories: "Kategorien", stages: "Phasensummen", stage: "Phase", current: "Aktueller Wert", change: "Änderung zum vorherigen Snapshot", first: "Erster Snapshot" },
} as const;

export async function exportSnapshotReportPdf(input: SnapshotExportInput, requestedLocale: string) {
  const locale = requestedLocale === "de" || requestedLocale === "en" ? requestedLocale : "uk";
  const t = labels[locale];
  const intlLocale = locale === "uk" ? "uk-UA" : locale === "de" ? "de-DE" : "en-GB";
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  const maker = pdfMake as typeof pdfMake & { vfs: Record<string, string> };
  maker.vfs = pdfFonts as unknown as Record<string, string>;
  const delta = (value: number | null) => value === null ? t.first : `${value > 0 ? "+" : ""}${value}`;
  const categoryRows = Object.entries(input.payload.categories).map(([id, category]) => [category.name, String(input.payload.plots.filter(({ properties }) => properties.category === id).length)]);
  maker.createPdf({
    info: { title: `GeoPartners - ${t.title}` }, defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: "GeoPartners", bold: true, color: "#23754c", fontSize: 12 },
      { text: t.title, bold: true, fontSize: 20, margin: [0, 5, 0, 8] },
      { text: `${t.generated}: ${new Date().toLocaleString(intlLocale)}`, color: "#66756d" },
      { text: `${t.snapshot}: ${new Date(input.capturedAt).toLocaleString(intlLocale)}`, color: "#66756d" },
      { text: `${t.database}: ${input.payload.workspace === "sandbox" ? t.sandbox : t.production}`, color: "#66756d", margin: [0, 0, 0, 12] },
      { text: `${t.plots}: ${input.kpis.plots.current}${input.kpis.plots.delta === null ? "" : ` (${delta(input.kpis.plots.delta)})`}`, bold: true, fontSize: 13, margin: [0, 0, 0, 10] },
      { text: t.categories, bold: true, fontSize: 12, margin: [0, 6, 0, 5] },
      { table: { headerRows: 1, widths: ["*", 70], body: [[t.categories, t.plots], ...categoryRows] }, layout: "lightHorizontalLines" },
      { text: t.stages, bold: true, fontSize: 12, margin: [0, 14, 0, 5] },
      { table: { headerRows: 1, widths: [24, "*", 80, 120], body: [["#", t.stage, t.current, t.change], ...input.kpis.statuses.map((item, index) => [String(index + 1), item.name, String(item.current), delta(item.delta)])] }, layout: "lightHorizontalLines" },
    ],
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "center", color: "#778279", fontSize: 8 }),
  }).download(`geopartners-snapshot-${new Date(input.capturedAt).toISOString().slice(0, 10)}.pdf`);
}
