import type { CategoryDefinition } from "@/data/demo";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import type { PlotFeature } from "@/components/workspace/types";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { defaultLocale, intlLocale, isAppLocale, type AppLocale } from "@/i18n/config";
import { totalPlotStatusCost } from "@/lib/plot-status-progress";
import type { PlotResultType } from "@/lib/plot-result-links";
import type { ResultReportGroup } from "@/lib/result-report";
import { formatPlotSpecialDetails } from "@/lib/plot-special-fields";

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
    totalStageCost: visible.reduce((sum, { properties }) => sum + totalPlotStatusCost(properties.statusProgress), 0),
    byCategory,
    plots: visible,
  };
}

export async function exportReportPdf(summary: ReportSummary, requestedLocale: string = defaultLocale, statuses: PlotStatusDefinition[] = [], includeExpenses = true) {
  const locale = normalizeLocale(requestedLocale);
  const labels = reportLabels[locale];
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const maker = pdfMake as typeof pdfMake & { vfs: Record<string, string> };
  const fonts = pdfFonts as unknown as Record<string, string>;
  maker.vfs = fonts;
  const definition: TDocumentDefinitions = {
    info: { title: `GeoPartners - ${labels.summaryReport}` },
    defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: "GeoPartners", style: "brand" },
      { text: labels.title, style: "title" },
      { text: `${labels.generated}: ${summary.generatedAt.toLocaleString(intlLocale(locale))}`, color: "#66756d", margin: [0, 0, 0, 16] },
      { columns: [metric(labels.plots, String(summary.count)), metric(labels.totalArea, `${formatArea(summary.totalArea, locale)} ${labels.ha}`)], margin: [0, 0, 0, 18] },
      { text: labels.byCategory, style: "heading" },
      { table: { widths: ["*", 70, 90], body: [[labels.category, labels.count, labels.areaHa], ...summary.byCategory.map((item) => [item.name, item.count, formatArea(item.area, locale)])] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 18] },
      { text: labels.plotList, style: "heading" },
      { table: { headerRows: 1, widths: [105, "*", 52, 85], body: [[labels.cadastralNumber, labels.nameOwner, labels.area, labels.category], ...summary.plots.map(({ properties }) => [properties.cadastralNumber, `${properties.name}\n${properties.owner}`, formatArea(properties.areaHa, locale), summary.byCategory.find(({ id }) => id === properties.category)?.name ?? properties.category])] }, layout: "lightHorizontalLines" },
      ...(statuses.length ? pdfStageContent(summary, statuses, locale, labels, includeExpenses) : []),
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

export async function exportReportDocx(summary: ReportSummary, requestedLocale: string = defaultLocale, statuses: PlotStatusDefinition[] = [], includeExpenses = true) {
  const locale = normalizeLocale(requestedLocale);
  const labels = reportLabels[locale];
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = await import("docx");
  const tableWidth = 9020;
  const plotColumnWidths = [2700, 2700, 1200, 2420] as const;
  const stageColumnWidths = includeExpenses ? [5000, 2400, 1620] : [5900, 3120];
  const tableRows = [
    new TableRow({ children: [cell(labels.cadastralNumber, true, plotColumnWidths[0]), cell(labels.nameOwner, true, plotColumnWidths[1]), cell(labels.areaHa, true, plotColumnWidths[2]), cell(labels.category, true, plotColumnWidths[3])] }),
    ...summary.plots.map(({ properties }) => new TableRow({ children: [
      cell(properties.cadastralNumber, false, plotColumnWidths[0]), cell(`${properties.name}\n${properties.owner}`, false, plotColumnWidths[1]), cell(formatArea(properties.areaHa, locale), false, plotColumnWidths[2]), cell(summary.byCategory.find(({ id }) => id === properties.category)?.name ?? properties.category, false, plotColumnWidths[3]),
    ] })),
  ];
  const doc = new Document({ sections: [{ properties: {}, children: [
    new Paragraph({ text: "GeoPartners", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: labels.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${labels.generated}: ${summary.generatedAt.toLocaleString(intlLocale(locale))}` }),
    new Paragraph({ text: `${labels.plots}: ${summary.count}. ${labels.totalArea}: ${formatArea(summary.totalArea, locale)} ${labels.ha}.` }),
    new Paragraph({ text: labels.byCategory, heading: HeadingLevel.HEADING_2 }),
    ...summary.byCategory.map((item) => new Paragraph({ text: `${item.name}: ${item.count} ${labels.pieces}, ${formatArea(item.area, locale)} ${labels.ha}` })),
    new Paragraph({ text: labels.plotList, heading: HeadingLevel.HEADING_2 }),
    new Table({ width: { size: tableWidth, type: WidthType.DXA }, columnWidths: plotColumnWidths, layout: TableLayoutType.AUTOFIT, rows: tableRows }),
    ...(statuses.length ? [
      new Paragraph({ text: labels.stageProgress, heading: HeadingLevel.HEADING_2 }),
      ...summary.plots.flatMap(({ properties }) => {
        const progress = new Map((properties.statusProgress ?? []).map((entry) => [entry.statusId, entry]));
        return [
          new Paragraph({ text: `${properties.cadastralNumber} · ${properties.name}`, heading: HeadingLevel.HEADING_3 }),
          new Table({ width: { size: tableWidth, type: WidthType.DXA }, columnWidths: stageColumnWidths, layout: TableLayoutType.AUTOFIT, rows: [
            new TableRow({ children: [cell(labels.stage, true, stageColumnWidths[0]), cell(labels.completionDate, true, stageColumnWidths[1]), ...(includeExpenses ? [cell(labels.expenses, true, stageColumnWidths[2])] : [])] }),
            ...statuses.map((status) => {
              const entry = progress.get(status.id);
              return new TableRow({ children: [cell(status.name, false, stageColumnWidths[0]), cell(entry ? formatDate(entry.completedAt, locale) : labels.notCompleted, false, stageColumnWidths[1]), ...(includeExpenses ? [cell(entry?.cost === null || entry?.cost === undefined ? labels.notSpecified : formatCurrency(entry.cost, locale), false, stageColumnWidths[2])] : [])] });
            }),
          ] }),
        ];
      }),
    ] : []),
  ] }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `geopartners-report-${dateStamp()}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);

  function cell(text: string, bold = false, width?: number) {
    return new TableCell({ width: width ? { size: width, type: WidthType.DXA } : undefined, children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });
  }
}

export async function exportResultReportPdf(groups: ResultReportGroup[], type: PlotResultType, requestedLocale: string = defaultLocale, statuses: PlotStatusDefinition[] = [], includeExpenses = true) {
  const locale = normalizeLocale(requestedLocale); const labels = reportLabels[locale];
  const resultLabels = reportResultLabels[locale][type];
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  const maker = pdfMake as typeof pdfMake & { vfs: Record<string, string> }; maker.vfs = pdfFonts as unknown as Record<string, string>;
  const content: Content[] = [{ text: "GeoPartners", style: "brand" }, { text: resultLabels.title, style: "title" }, { text: `${labels.generated}: ${new Date().toLocaleString(intlLocale(locale))}`, color: "#66756d", margin: [0, 0, 0, 12] }];
  for (const group of groups) content.push(...resultPdfBlock(group, statuses, locale, labels, resultLabels, includeExpenses));
  const definition: TDocumentDefinitions = { info: { title: `GeoPartners - ${resultLabels.title}` }, defaultStyle: { font: "Roboto", fontSize: 9 }, content, styles: { brand: { bold: true, color: "#23754c", fontSize: 12, margin: [0, 0, 0, 6] }, title: { bold: true, fontSize: 18, margin: [0, 0, 0, 5] }, heading: { bold: true, fontSize: 12, margin: [0, 0, 0, 6] } }, footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "center", color: "#778279", fontSize: 8 }) };
  maker.createPdf(definition).download(`geopartners-${type}-report-${dateStamp()}.pdf`);
}

export async function exportResultReportDocx(groups: ResultReportGroup[], type: PlotResultType, requestedLocale: string = defaultLocale, statuses: PlotStatusDefinition[] = [], includeExpenses = true) {
  const locale = normalizeLocale(requestedLocale); const labels = reportLabels[locale];
  const resultLabels = reportResultLabels[locale][type];
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = await import("docx");
  const tableWidth = 9020; const infoWidths = [1500, 2400, 2500, 2620] as const; const stageWidths = includeExpenses ? [5000, 2400, 1620] : [5900, 3120];
  const cell = (text: string, bold = false, width?: number) => new TableCell({ width: width ? { size: width, type: WidthType.DXA } : undefined, children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });
  const children: Array<import("docx").Paragraph | import("docx").Table> = [new Paragraph({ text: "GeoPartners", heading: HeadingLevel.HEADING_2 }), new Paragraph({ text: resultLabels.title, heading: HeadingLevel.TITLE }), new Paragraph({ text: `${labels.generated}: ${new Date().toLocaleString(intlLocale(locale))}` })];
  for (const group of groups) {
    const primary = group.primary?.properties;
    children.push(new Paragraph({ text: `${resultLabels.number} ${group.number}`, heading: HeadingLevel.HEADING_2 }));
    children.push(new Table({ width: { size: tableWidth, type: WidthType.DXA }, columnWidths: infoWidths, layout: TableLayoutType.AUTOFIT, rows: [new TableRow({ children: [cell(labels.relationship, true, infoWidths[0]), cell(labels.cadastralNumber, true, infoWidths[1]), cell(`${labels.owner} / ${labels.lessee}`, true, infoWidths[2]), cell(labels.specialParameters, true, infoWidths[3])] }), new TableRow({ children: [cell(labels.mainCandidate, false, infoWidths[0]), cell(primary?.cadastralNumber ?? labels.notSpecified, false, infoWidths[1]), cell(primary ? `${primary.owner}\n${primary.lessee}` : labels.notSpecified, false, infoWidths[2]), cell(primary ? formatPlotSpecialDetails(primary, type, locale) : labels.notSpecified, false, infoWidths[3])] }), ...group.alternativeCandidates.map(({ properties }) => new TableRow({ children: [cell(labels.alternativeCandidate, false, infoWidths[0]), cell(properties.cadastralNumber, false, infoWidths[1]), cell(`${properties.owner}\n${properties.lessee}`, false, infoWidths[2]), cell(formatPlotSpecialDetails(properties, type, locale), false, infoWidths[3])] })), ...group.finalPlots.map(({ properties }) => new TableRow({ children: [cell(resultLabels.finalPlot, false, infoWidths[0]), cell(properties.cadastralNumber, false, infoWidths[1]), cell(`${properties.owner}\n${properties.lessee}`, false, infoWidths[2]), cell(formatPlotSpecialDetails(properties, type, locale), false, infoWidths[3])] }))] }));
    children.push(new Table({ width: { size: tableWidth, type: WidthType.DXA }, columnWidths: stageWidths, layout: TableLayoutType.AUTOFIT, rows: [new TableRow({ children: [cell(labels.stage, true, stageWidths[0]), cell(labels.completionDate, true, stageWidths[1]), ...(includeExpenses ? [cell(labels.expenses, true, stageWidths[2])] : [])] }), ...statuses.map((status) => { const entry = group.progress.get(status.id); return new TableRow({ children: [cell(status.name, false, stageWidths[0]), cell(entry ? formatDate(entry.completedAt, locale) : labels.notCompleted, false, stageWidths[1]), ...(includeExpenses ? [cell(entry?.cost === null || entry?.cost === undefined ? labels.notSpecified : formatCurrency(entry.cost, locale), false, stageWidths[2])] : [])] }); })] }));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] }); const blob = await Packer.toBlob(doc); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `geopartners-${type}-report-${dateStamp()}.docx`; anchor.click(); URL.revokeObjectURL(url);
}

export function printReport() {
  window.print();
}

function metric(label: string, value: string): Content {
  return { stack: [{ text: value, bold: true, fontSize: 16, color: "#17231d" }, { text: label, color: "#66756d", margin: [0, 3, 0, 0] }] };
}
function formatArea(value: number, locale: AppLocale) { return value.toLocaleString(intlLocale(locale), { maximumFractionDigits: 4 }); }
function formatCurrency(value: number, locale: AppLocale) { return value.toLocaleString(intlLocale(locale), { style: "currency", currency: "UAH" }); }
function formatDate(value: string, locale: AppLocale) { return new Date(value).toLocaleString(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }

function pdfStageContent(summary: ReportSummary, statuses: PlotStatusDefinition[], locale: AppLocale, labels: (typeof reportLabels)[AppLocale], includeExpenses: boolean): Content[] {
  return [
    { text: labels.stageProgress, style: "heading", margin: [0, 18, 0, 8] },
    ...summary.plots.flatMap(({ properties }) => {
      const progress = new Map((properties.statusProgress ?? []).map((entry) => [entry.statusId, entry]));
      return [
        { text: `${properties.cadastralNumber} · ${properties.name}`, bold: true, margin: [0, 8, 0, 4] } as Content,
        { table: { headerRows: 1, widths: includeExpenses ? ["*", 105, 80] : ["*", 125], body: [
          [labels.stage, labels.completionDate, ...(includeExpenses ? [labels.expenses] : [])],
          ...statuses.map((status) => {
            const entry = progress.get(status.id);
            return [status.name, entry ? formatDate(entry.completedAt, locale) : labels.notCompleted, ...(includeExpenses ? [entry?.cost === null || entry?.cost === undefined ? labels.notSpecified : formatCurrency(entry.cost, locale)] : [])];
          }),
        ] }, layout: "lightHorizontalLines", fontSize: 8 } as Content,
      ];
    }),
  ];
}

function resultPdfBlock(group: ResultReportGroup, statuses: PlotStatusDefinition[], locale: AppLocale, labels: (typeof reportLabels)[AppLocale], resultLabels: { title: string; number: string; finalPlot: string }, includeExpenses: boolean): Content[] {
  const primary = group.primary?.properties;
  const rows = [[labels.relationship, labels.cadastralNumber, `${labels.owner} / ${labels.lessee}`, labels.specialParameters], [labels.mainCandidate, primary?.cadastralNumber ?? labels.notSpecified, primary ? `${primary.owner}\n${primary.lessee}` : labels.notSpecified, primary ? formatPlotSpecialDetails(primary, group.type, locale) : labels.notSpecified], ...group.alternativeCandidates.map(({ properties }) => [labels.alternativeCandidate, properties.cadastralNumber, `${properties.owner}\n${properties.lessee}`, formatPlotSpecialDetails(properties, group.type, locale)]), ...group.finalPlots.map(({ properties }) => [resultLabels.finalPlot, properties.cadastralNumber, `${properties.owner}\n${properties.lessee}`, formatPlotSpecialDetails(properties, group.type, locale)])];
  return [{ text: `${resultLabels.number} ${group.number}`, style: "heading", margin: [0, 12, 0, 5] }, { table: { headerRows: 1, widths: [65, 95, 130, "*"], body: rows }, layout: "lightHorizontalLines", fontSize: 8 }, { table: { headerRows: 1, widths: includeExpenses ? ["*", 105, 80] : ["*", 125], body: [[labels.stage, labels.completionDate, ...(includeExpenses ? [labels.expenses] : [])], ...statuses.map((status) => { const entry = group.progress.get(status.id); return [status.name, entry ? formatDate(entry.completedAt, locale) : labels.notCompleted, ...(includeExpenses ? [entry?.cost === null || entry?.cost === undefined ? labels.notSpecified : formatCurrency(entry.cost, locale)] : [])]; })] }, layout: "lightHorizontalLines", fontSize: 8, margin: [0, 7, 0, 0] }];
}

function normalizeLocale(locale: string): AppLocale {
  return isAppLocale(locale) ? locale : defaultLocale;
}

const reportLabels: Record<AppLocale, {
  summaryReport: string; title: string; wtgReport: string; generated: string; plots: string; totalArea: string;
  byCategory: string; category: string; count: string; areaHa: string; plotList: string;
  cadastralNumber: string; nameOwner: string; area: string; ha: string; pieces: string;
  stageProgress: string; stage: string; completionDate: string; expenses: string; notCompleted: string; notSpecified: string;
  wtgNumber: string; relationship: string; mainCandidate: string; alternativeCandidate: string; finalWtgPlot: string; owner: string; lessee: string; specialParameters: string;
}> = {
  uk: { summaryReport: "зведений звіт", title: "Зведений звіт по земельних ділянках", wtgReport: "Звіт за ВЕУ", generated: "Сформовано", plots: "Ділянок", totalArea: "Загальна площа", byCategory: "Розподіл за категоріями", category: "Категорія", count: "Кількість", areaHa: "Площа, га", plotList: "Перелік ділянок", cadastralNumber: "Кадастровий номер", nameOwner: "Назва / власник", area: "Площа", ha: "га", pieces: "шт.", stageProgress: "Проходження етапів", stage: "Етап", completionDate: "Дата проходження", expenses: "Витрати", notCompleted: "Не пройдено", notSpecified: "Не вказано", wtgNumber: "ВЕУ №", relationship: "Роль у групі", mainCandidate: "Основний кандидат", alternativeCandidate: "Альтернативний кандидат", finalWtgPlot: "Виділена ділянка ВЕУ", owner: "Власник", lessee: "Орендар", specialParameters: "Параметри об'єкта" },
  de: { summaryReport: "Zusammenfassung", title: "Zusammenfassung der Grundstücke", wtgReport: "WEA-Bericht", generated: "Erstellt", plots: "Flächen", totalArea: "Gesamtfläche", byCategory: "Verteilung nach Kategorien", category: "Kategorie", count: "Anzahl", areaHa: "Fläche, ha", plotList: "Flächenliste", cadastralNumber: "Katasternummer", nameOwner: "Name / Eigentümer", area: "Fläche", ha: "ha", pieces: "Stk.", stageProgress: "Phasenfortschritt", stage: "Phase", completionDate: "Abschlussdatum", expenses: "Ausgaben", notCompleted: "Nicht abgeschlossen", notSpecified: "Nicht angegeben", wtgNumber: "WEA-Nr.", relationship: "Rolle in der Gruppe", mainCandidate: "Hauptkandidat", alternativeCandidate: "Alternativkandidat", finalWtgPlot: "Abgetrennte WEA-Fläche", owner: "Eigentümer", lessee: "Pächter", specialParameters: "Objektparameter" },
  en: { summaryReport: "summary report", title: "Land plot summary report", wtgReport: "WTG report", generated: "Generated", plots: "Plots", totalArea: "Total area", byCategory: "Distribution by category", category: "Category", count: "Count", areaHa: "Area, ha", plotList: "Plot list", cadastralNumber: "Cadastral number", nameOwner: "Name / owner", area: "Area", ha: "ha", pieces: "pcs.", stageProgress: "Stage progress", stage: "Stage", completionDate: "Completion date", expenses: "Expenses", notCompleted: "Not completed", notSpecified: "Not specified", wtgNumber: "WTG no.", relationship: "Group role", mainCandidate: "Main candidate", alternativeCandidate: "Alternative candidate", finalWtgPlot: "Allocated WTG plot", owner: "Owner", lessee: "Lessee", specialParameters: "Object parameters" },
};

const reportResultLabels: Record<AppLocale, Record<PlotResultType, { title: string; number: string; finalPlot: string }>> = {
  uk: {
    wtg: { title: "Звіт за ВЕУ", number: "ВЕУ №", finalPlot: "Виділена ділянка ВЕУ" },
    road: { title: "Звіт за дорогами", number: "Дорога №", finalPlot: "Ділянка дороги" },
    servitude: { title: "Звіт за сервітутами", number: "Сервітут №", finalPlot: "Ділянка сервітуту" },
    substation: { title: "Звіт за підстанціями", number: "Підстанція №", finalPlot: "Ділянка підстанції" },
  },
  de: {
    wtg: { title: "WEA-Bericht", number: "WEA-Nr.", finalPlot: "Abgetrennte WEA-Fläche" },
    road: { title: "Straßenbericht", number: "Straßen-Nr.", finalPlot: "Straßenfläche" },
    servitude: { title: "Dienstbarkeitsbericht", number: "Dienstbarkeits-Nr.", finalPlot: "Dienstbarkeitsfläche" },
    substation: { title: "Umspannwerksbericht", number: "Umspannwerks-Nr.", finalPlot: "Umspannwerksfläche" },
  },
  en: {
    wtg: { title: "WTG report", number: "WTG no.", finalPlot: "Allocated WTG plot" },
    road: { title: "Road report", number: "Road no.", finalPlot: "Road plot" },
    servitude: { title: "Easement report", number: "Easement no.", finalPlot: "Easement plot" },
    substation: { title: "Substation report", number: "Substation no.", finalPlot: "Substation plot" },
  },
};
