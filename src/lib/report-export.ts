import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

export type ReportSummary = ReturnType<typeof summarizePlots>;

export function summarizePlots(plots: PlotFeature[], categories: Record<string, CategoryDefinition>) {
  const visible = plots.filter(({ properties }) => categories[properties.category]?.visible !== false);
  const byCategory = Object.entries(visible.reduce<Record<string, { count: number; area: number }>>((result, { properties }) => {
    const item = result[properties.category] ?? { count: 0, area: 0 };
    item.count += 1;
    item.area += properties.areaHa;
    result[properties.category] = item;
    return result;
  }, {})).map(([id, values]) => ({ id, name: categories[id]?.name ?? id, color: categories[id]?.color ?? "#2f86a6", ...values }));

  return {
    generatedAt: new Date(),
    count: visible.length,
    totalArea: visible.reduce((sum, { properties }) => sum + properties.areaHa, 0),
    byCategory,
    plots: visible,
  };
}

export async function exportReportPdf(summary: ReportSummary) {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const maker = pdfMake as typeof pdfMake & { vfs: Record<string, string> };
  const fonts = pdfFonts as unknown as Record<string, string>;
  maker.vfs = fonts;
  const definition: TDocumentDefinitions = {
    info: { title: "GeoPartners - зведений звіт" },
    defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: "GeoPartners", style: "brand" },
      { text: "Зведений звіт по земельних ділянках", style: "title" },
      { text: `Сформовано: ${summary.generatedAt.toLocaleString("uk-UA")}`, color: "#66756d", margin: [0, 0, 0, 16] },
      { columns: [metric("Ділянок", String(summary.count)), metric("Загальна площа", `${formatArea(summary.totalArea)} га`)], margin: [0, 0, 0, 18] },
      { text: "Розподіл за категоріями", style: "heading" },
      { table: { widths: ["*", 70, 90], body: [["Категорія", "Кількість", "Площа, га"], ...summary.byCategory.map((item) => [item.name, item.count, formatArea(item.area)])] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 18] },
      { text: "Перелік ділянок", style: "heading" },
      { table: { headerRows: 1, widths: [105, "*", 52, 85], body: [["Кадастровий номер", "Назва / власник", "Площа", "Категорія"], ...summary.plots.map(({ properties }) => [properties.cadastralNumber, `${properties.name}\n${properties.owner}`, formatArea(properties.areaHa), summary.byCategory.find(({ id }) => id === properties.category)?.name ?? properties.category])] }, layout: "lightHorizontalLines" },
    ],
    styles: {
      brand: { bold: true, color: "#23754c", fontSize: 12, margin: [0, 0, 0, 6] },
      title: { bold: true, fontSize: 18, margin: [0, 0, 0, 5] },
      heading: { bold: true, fontSize: 12, margin: [0, 0, 0, 8] },
    },
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "center", color: "#778279", fontSize: 8 }),
  };
  maker.createPdf(definition).download(`geopartners-report-${dateStamp()}.pdf`);
}

export async function exportReportDocx(summary: ReportSummary) {
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const tableRows = [
    new TableRow({ children: [cell("Кадастровий номер", true), cell("Назва / власник", true), cell("Площа, га", true), cell("Категорія", true)] }),
    ...summary.plots.map(({ properties }) => new TableRow({ children: [
      cell(properties.cadastralNumber), cell(`${properties.name}\n${properties.owner}`), cell(formatArea(properties.areaHa)), cell(summary.byCategory.find(({ id }) => id === properties.category)?.name ?? properties.category),
    ] })),
  ];
  const doc = new Document({ sections: [{ properties: {}, children: [
    new Paragraph({ text: "GeoPartners", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: "Зведений звіт по земельних ділянках", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Сформовано: ${summary.generatedAt.toLocaleString("uk-UA")}` }),
    new Paragraph({ text: `Ділянок: ${summary.count}. Загальна площа: ${formatArea(summary.totalArea)} га.` }),
    new Paragraph({ text: "Розподіл за категоріями", heading: HeadingLevel.HEADING_2 }),
    ...summary.byCategory.map((item) => new Paragraph({ text: `${item.name}: ${item.count} шт., ${formatArea(item.area)} га` })),
    new Paragraph({ text: "Перелік ділянок", heading: HeadingLevel.HEADING_2 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
  ] }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `geopartners-report-${dateStamp()}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);

  function cell(text: string, bold = false) {
    return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });
  }
}

export function printReport() {
  window.print();
}

function metric(label: string, value: string): Content {
  return { stack: [{ text: value, bold: true, fontSize: 16, color: "#17231d" }, { text: label, color: "#66756d", margin: [0, 3, 0, 0] }] };
}
function formatArea(value: number) { return value.toLocaleString("uk-UA", { maximumFractionDigits: 4 }); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }
