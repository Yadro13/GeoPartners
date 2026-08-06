import type { CategoryDefinition } from "@/data/demo";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { defaultLocale, intlLocale, isAppLocale, type AppLocale } from "@/i18n/config";
import { totalPlotStatusCost } from "@/lib/plot-status-progress";
import type { PlotFeature } from "@/components/workspace/types";
import { wtgGroupPlots, type WtgReportGroup } from "@/lib/wtg-report";

export type StatusReportRow = {
  plot: PlotFeature;
  category: CategoryDefinition;
  progress: Map<string, NonNullable<PlotFeature["properties"]["statusProgress"]>[number]>;
  completedCount: number;
  totalCost: number;
};

export function buildStatusReportRows(plots: PlotFeature[], categories: Record<string, CategoryDefinition>) {
  return plots
    .filter(({ properties }) => categories[properties.category]?.visible !== false)
    .map((plot): StatusReportRow => {
      const entries = plot.properties.statusProgress ?? [];
      return {
        plot,
        category: categories[plot.properties.category] ?? { name: plot.properties.category, description: "", color: "#66756d", visible: true },
        progress: new Map(entries.map((entry) => [entry.statusId, entry])),
        completedCount: entries.length,
        totalCost: totalPlotStatusCost(entries),
      };
    });
}

export async function exportStatusReportXlsx(rows: StatusReportRow[], statuses: PlotStatusDefinition[], requestedLocale: string = defaultLocale) {
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const labels = xlsxLabels[locale];
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "GeoPartners";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = labels.title;

  createMatrixSheet(workbook, rows, statuses, locale, labels);
  createDetailsSheet(workbook, rows, statuses, labels, locale);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `geopartners-status-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportWtgReportXlsx(groups: WtgReportGroup[], statuses: PlotStatusDefinition[], requestedLocale: string = defaultLocale, categories: Record<string, CategoryDefinition> = {}) {
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const labels = xlsxLabels[locale];
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "GeoPartners"; workbook.created = new Date(); workbook.modified = new Date(); workbook.subject = labels.wtgTitle;
  const dateFormat = xlsxDateFormat(locale);
  const sheet = workbook.addWorksheet(labels.wtgSheet, { views: [{ state: "frozen", xSplit: 7, ySplit: 4, topLeftCell: "H5", activeCell: "H5" }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.mergeCells(1, 1, 1, 7 + statuses.length); sheet.getCell(1, 1).value = labels.wtgTitle; sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF173126" } };
  sheet.mergeCells(2, 1, 2, 7 + statuses.length); sheet.getCell(2, 1).value = `${labels.generated}: ${new Date().toLocaleString(intlLocale(locale))}`;
  sheet.getRow(4).values = [labels.wtgNumber, labels.mainCadastral, labels.owner, labels.lessee, labels.alternatives, labels.finalWtgPlot, labels.totalExpenses, ...statuses.map(({ name }) => name)];
  sheet.getRow(4).height = 74; styleHeader(sheet.getRow(4));
  sheet.columns = [{ width: 13 }, { width: 25 }, { width: 28 }, { width: 28 }, { width: 34 }, { width: 25 }, { width: 16 }, ...statuses.map(() => ({ width: 15 }))];
  groups.forEach((group, index) => {
    const primary = group.primary?.properties;
    const row = sheet.addRow([group.number, primary?.cadastralNumber ?? "", primary?.owner ?? "", primary?.lessee ?? "", group.alternativeCandidates.map(({ properties }) => `${properties.cadastralNumber}\n${properties.owner}\n${properties.lessee}`).join("\n\n"), group.finalPlots.map(({ properties }) => properties.cadastralNumber).join("\n"), group.totalCost, ...statuses.map(({ id }) => group.progress.has(id) ? new Date(group.progress.get(id)!.completedAt) : null)]);
    row.alignment = { vertical: "top", wrapText: true }; row.getCell(7).numFmt = '#,##0.00 "UAH"'; row.height = Math.max(34, group.alternativeCandidates.length * 42);
    statuses.forEach((_, statusIndex) => { const cell = row.getCell(8 + statusIndex); cell.numFmt = dateFormat.date; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; if (cell.value) cell.fill = solidFill("FFE7F3EB"); });
    if (index % 2 === 1) row.eachCell((cell) => { if (!cell.fill || (cell.fill as { type?: string }).type !== "pattern") cell.fill = solidFill("FFF8FAF9"); });
  });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + groups.length, column: 7 + statuses.length } };
  sheet.eachRow((row, rowNumber) => row.eachCell({ includeEmpty: true }, (cell) => { if (rowNumber >= 4) cell.border = thinBorder(); }));

  const candidates = workbook.addWorksheet(labels.wtgCandidatesSheet, { views: [{ state: "frozen", ySplit: 1 }] });
  candidates.columns = [{ header: labels.wtgNumber, key: "wtg", width: 14 }, { header: labels.relationship, key: "relationship", width: 22 }, { header: labels.cadastralNumber, key: "cadastral", width: 25 }, { header: labels.category, key: "category", width: 22 }, { header: labels.owner, key: "owner", width: 34 }, { header: labels.lessee, key: "lessee", width: 34 }];
  styleHeader(candidates.getRow(1)); candidates.getRow(1).height = 34;
  for (const group of groups) for (const plot of wtgGroupPlots(group)) {
    const relationship = group.mainCandidates.some(({ properties }) => properties.id === plot.properties.id) ? labels.mainCandidate : group.alternativeCandidates.some(({ properties }) => properties.id === plot.properties.id) ? labels.alternativeCandidate : group.finalPlots.some(({ properties }) => properties.id === plot.properties.id) ? labels.finalWtgPlot : labels.relatedPlot;
    const row = candidates.addRow({ wtg: group.number, relationship, cadastral: plot.properties.cadastralNumber, category: categories[plot.properties.category]?.name ?? plot.properties.category, owner: plot.properties.owner, lessee: plot.properties.lessee }); row.alignment = { vertical: "top", wrapText: true };
  }
  candidates.autoFilter = { from: "A1", to: `F${Math.max(1, candidates.rowCount)}` }; candidates.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => { cell.border = thinBorder(); }));
  downloadWorkbook(workbook, `geopartners-wtg-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

type Workbook = InstanceType<(typeof import("exceljs"))["Workbook"]>;
type Labels = (typeof xlsxLabels)[AppLocale];

function createMatrixSheet(workbook: Workbook, rows: StatusReportRow[], statuses: PlotStatusDefinition[], locale: AppLocale, labels: Labels) {
  const dateFormat = xlsxDateFormat(locale);
  const sheet = workbook.addWorksheet(labels.matrixSheet, {
    views: [{ state: "frozen", xSplit: 5, ySplit: 4, topLeftCell: "F5", activeCell: "F5" }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: `&LGeoPartners&C${labels.matrixSheet}&R${labels.page} &P / &N` },
  });
  sheet.properties.defaultRowHeight = 22;
  sheet.mergeCells(1, 1, 1, 5 + statuses.length);
  sheet.getCell(1, 1).value = labels.title;
  sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF173126" } };
  sheet.getCell(2, 1).value = `${labels.generated}: ${new Date().toLocaleString(intlLocale(locale))}`;
  sheet.getCell(2, 1).font = { size: 10, color: { argb: "FF66756D" } };
  sheet.mergeCells(2, 1, 2, 5 + statuses.length);

  const headers = [labels.number, labels.plot, labels.cadastralNumber, labels.category, labels.totalExpenses, ...statuses.map(({ name }) => name)];
  sheet.getRow(4).values = headers;
  sheet.getRow(4).height = 74;
  styleHeader(sheet.getRow(4));
  sheet.columns = [
    { width: 7 }, { width: 28 }, { width: 25 }, { width: 22 }, { width: 16 },
    ...statuses.map(() => ({ width: 15 })),
  ];

  rows.forEach((item, index) => {
    const properties = item.plot.properties;
    const row = sheet.addRow([
      index + 1,
      properties.name || properties.owner || properties.cadastralNumber,
      properties.cadastralNumber,
      item.category.name,
      item.totalCost,
      ...statuses.map(({ id }) => {
        const entry = item.progress.get(id);
        return entry ? new Date(entry.completedAt) : null;
      }),
    ]);
    row.height = 34;
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(5).numFmt = '#,##0.00 "UAH"';
    statuses.forEach((_, statusIndex) => {
      const cell = row.getCell(6 + statusIndex);
      cell.numFmt = dateFormat.date;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (cell.value) cell.fill = solidFill("FFE7F3EB");
    });
    if (index % 2 === 1) row.eachCell((cell) => { if (!cell.fill || (cell.fill as { type?: string }).type !== "pattern") cell.fill = solidFill("FFF8FAF9"); });
  });

  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalRow = sheet.addRow([
    labels.totals,
    rows.length,
    null,
    null,
    { formula: rows.length ? `SUM(E5:E${4 + rows.length})` : "0", result: totalCost },
    ...statuses.map((status, index) => ({
      formula: rows.length ? `COUNT(${columnLetter(6 + index)}5:${columnLetter(6 + index)}${4 + rows.length})` : "0",
      result: rows.filter((row) => row.progress.has(status.id)).length,
    })),
  ]);
  totalRow.font = { bold: true, color: { argb: "FF173126" } };
  totalRow.fill = solidFill("FFDDEBE2");
  totalRow.getCell(5).numFmt = '#,##0.00 "UAH"';
  totalRow.alignment = { vertical: "middle", horizontal: "center" };
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: 5 + statuses.length } };
  sheet.eachRow((row, rowNumber) => row.eachCell({ includeEmpty: true }, (cell) => {
    if (rowNumber >= 4) cell.border = thinBorder();
  }));
}

function createDetailsSheet(workbook: Workbook, rows: StatusReportRow[], statuses: PlotStatusDefinition[], labels: Labels, locale: AppLocale) {
  const dateFormat = xlsxDateFormat(locale);
  const sheet = workbook.addWorksheet(labels.detailsSheet, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: labels.plot, key: "plot", width: 28 },
    { header: labels.cadastralNumber, key: "cadastral", width: 25 },
    { header: labels.category, key: "category", width: 22 },
    { header: labels.stageNumber, key: "stageNumber", width: 10 },
    { header: labels.stage, key: "stage", width: 42 },
    { header: labels.completed, key: "completed", width: 14 },
    { header: labels.completionDate, key: "completedAt", width: 21 },
    { header: labels.expenses, key: "cost", width: 18 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).height = 34;

  rows.forEach((item) => statuses.forEach((status, statusIndex) => {
    const entry = item.progress.get(status.id);
    const row = sheet.addRow({
      plot: item.plot.properties.name || item.plot.properties.owner || item.plot.properties.cadastralNumber,
      cadastral: item.plot.properties.cadastralNumber,
      category: item.category.name,
      stageNumber: statusIndex + 1,
      stage: status.name,
      completed: entry ? labels.yes : labels.no,
      completedAt: entry ? new Date(entry.completedAt) : null,
      cost: entry?.cost ?? null,
    });
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(7).numFmt = dateFormat.dateTime;
    row.getCell(8).numFmt = '#,##0.00 "UAH"';
    if (entry) row.getCell(6).fill = solidFill("FFE7F3EB");
  }));
  sheet.autoFilter = { from: "A1", to: `H${Math.max(1, sheet.rowCount)}` };
  sheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => { cell.border = thinBorder(); }));
  sheet.getCell("J1").value = labels.generated;
  sheet.getCell("J2").value = new Date();
  sheet.getCell("J2").numFmt = dateFormat.dateTime;
  sheet.getCell("J4").value = labels.currencyNote;
  sheet.getCell("J4").alignment = { wrapText: true };
  sheet.getColumn("J").width = 28;
  sheet.getCell("J1").font = { bold: true };
  sheet.getCell("J4").font = { color: { argb: "FF66756D" }, italic: true };
}

function styleHeader(row: import("exceljs").Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill = solidFill("FF23754C");
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function solidFill(argb: string): import("exceljs").Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<import("exceljs").Borders> {
  const edge = { style: "thin" as const, color: { argb: "FFD9E1DC" } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function columnLetter(column: number) {
  let value = column;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function xlsxDateFormat(locale: AppLocale) {
  return locale === "en"
    ? { date: "mm/dd/yyyy", dateTime: "mm/dd/yyyy hh:mm" }
    : { date: "dd.mm.yyyy", dateTime: "dd.mm.yyyy hh:mm" };
}

async function downloadWorkbook(workbook: Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

const xlsxLabels = {
  uk: { title: "Звіт про проходження етапів земельних ділянок", wtgTitle: "Звіт за ВЕУ", matrixSheet: "Матриця етапів", detailsSheet: "Деталі", wtgSheet: "ВЕУ та етапи", wtgCandidatesSheet: "Кандидати ВЕУ", generated: "Сформовано", page: "Сторінка", number: "№", plot: "Ділянка", cadastralNumber: "Кадастровий номер", category: "Категорія", totalExpenses: "Витрати разом", totals: "Разом", stageNumber: "№ етапу", stage: "Етап", completed: "Пройдено", completionDate: "Дата проходження", expenses: "Витрати", yes: "Так", no: "Ні", currencyNote: "Суми витрат наведено у гривнях (UAH).", wtgNumber: "№ ВЕУ", mainCadastral: "Основний кандидат", owner: "Власник", lessee: "Орендар", alternatives: "Альтернативні кандидати", finalWtgPlot: "Виділена ділянка ВЕУ", relationship: "Роль у групі", mainCandidate: "Основний кандидат", alternativeCandidate: "Альтернативний кандидат", relatedPlot: "Пов'язана ділянка" },
  de: { title: "Bericht zum Fortschritt der Grundstücksphasen", wtgTitle: "WEA-Bericht", matrixSheet: "Phasenmatrix", detailsSheet: "Details", wtgSheet: "WEA und Phasen", wtgCandidatesSheet: "WEA-Kandidaten", generated: "Erstellt", page: "Seite", number: "Nr.", plot: "Grundstück", cadastralNumber: "Katasternummer", category: "Kategorie", totalExpenses: "Gesamtausgaben", totals: "Gesamt", stageNumber: "Phasennr.", stage: "Phase", completed: "Abgeschlossen", completionDate: "Abschlussdatum", expenses: "Ausgaben", yes: "Ja", no: "Nein", currencyNote: "Die Ausgaben werden in ukrainischen Hrywnja (UAH) ausgewiesen.", wtgNumber: "WEA-Nr.", mainCadastral: "Hauptkandidat", owner: "Eigentümer", lessee: "Pächter", alternatives: "Alternativkandidaten", finalWtgPlot: "Abgetrennte WEA-Fläche", relationship: "Rolle in der Gruppe", mainCandidate: "Hauptkandidat", alternativeCandidate: "Alternativkandidat", relatedPlot: "Verknüpfte Fläche" },
  en: { title: "Land plot stage progress report", wtgTitle: "WTG report", matrixSheet: "Stage matrix", detailsSheet: "Details", wtgSheet: "WTGs and stages", wtgCandidatesSheet: "WTG candidates", generated: "Generated", page: "Page", number: "No.", plot: "Plot", cadastralNumber: "Cadastral number", category: "Category", totalExpenses: "Total expenses", totals: "Total", stageNumber: "Stage no.", stage: "Stage", completed: "Completed", completionDate: "Completion date", expenses: "Expenses", yes: "Yes", no: "No", currencyNote: "Expenses are shown in Ukrainian hryvnia (UAH).", wtgNumber: "WTG no.", mainCadastral: "Main candidate", owner: "Owner", lessee: "Lessee", alternatives: "Alternative candidates", finalWtgPlot: "Allocated WTG plot", relationship: "Group role", mainCandidate: "Main candidate", alternativeCandidate: "Alternative candidate", relatedPlot: "Related plot" },
} satisfies Record<AppLocale, Record<string, string>>;
