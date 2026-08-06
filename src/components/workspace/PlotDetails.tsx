import { ExternalLink, FileText, ListChecks, Pencil } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CategoryDefinition } from "@/data/demo";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { totalPlotStatusCost } from "@/lib/plot-status-progress";
import { parsePlotResultLinks, type PlotResultType } from "@/lib/plot-result-links";
import type { PlotFeature } from "./types";

type PlotDetailsProps = {
  plot: PlotFeature | null;
  compact?: boolean;
  categories: Record<string, CategoryDefinition>;
  plotStatuses: PlotStatusDefinition[];
  onEdit?: (plot: PlotFeature) => void;
  onOpenStages: (plot: PlotFeature) => void;
  onDocuments: (plot: PlotFeature) => void;
  onOpenCard: (plot: PlotFeature) => void;
};

export function PlotDetails({ plot, compact = false, categories, plotStatuses, onEdit, onOpenStages, onDocuments, onOpenCard }: PlotDetailsProps) {
  const t = useTranslations("workspace");
  const format = useFormatter();
  if (!plot) {
    return <div className="plot-details-empty">{t("selectPlot")}</div>;
  }

  const { properties } = plot;
  const category = categories[properties.category] ?? categories.default ?? { name: properties.category, color: "#2f86a6" };
  const completedStages = properties.statusProgress ?? [];
  const totalCost = totalPlotStatusCost(completedStages);
  const resultLinks = parsePlotResultLinks(properties.resultLinks);
  const resultLabels: Record<PlotResultType, string> = { wtg: t("resultWtg"), road: t("resultRoad"), servitude: t("resultServitude"), substation: t("resultSubstation") };

  return (
    <div className="plot-details" data-compact={compact}>
      <header className="plot-details__header">
        <div>
          <span className="eyebrow">{t("cadastralNumber")}</span>
          <h2>{properties.cadastralNumber}</h2>
        </div>
        {onEdit ? <button className="icon-button" type="button" onClick={() => onEdit(plot)} title={t("editPlot")} aria-label={t("editPlot")}>
          <Pencil size={18} aria-hidden="true" />
        </button> : null}
      </header>

      <div className="category-line">
        <span className="category-line__swatch" style={{ background: category.color }} />
        {category.name}
      </div>

      <dl className="details-grid">
        <div><dt>{t("area")}</dt><dd>{format.number(properties.areaHa, { maximumFractionDigits: 4 })} ha</dd></div>
        <div><dt>{t("stages")}</dt><dd>{t("stagesDone", { done: completedStages.length, total: plotStatuses.length })}</dd></div>
        {properties.documentActualAt ? <div><dt>{t("documentActualAt")}</dt><dd>{format.dateTime(new Date(properties.documentActualAt), { dateStyle: "medium", timeStyle: "short" })}</dd></div> : null}
        {totalCost > 0 ? <div><dt>{t("totalExpenses")}</dt><dd>{format.number(totalCost, { style: "currency", currency: "UAH" })}</dd></div> : null}
        <div className="details-grid__wide"><dt>{t("owner")}</dt><dd>{properties.owner || t("notSpecified")}</dd></div>
        <div className="details-grid__wide"><dt>{t("lessee")}</dt><dd>{properties.lessee || t("notSpecified")}</dd></div>
        {resultLinks.length ? <div className="details-grid__wide"><dt>{t("resultLinks")}</dt><dd className="result-links-summary">{resultLinks.map((link, index) => <span key={`${link.type}-${link.number}-${index}`}><strong>{resultLabels[link.type]}</strong>{link.number}</span>)}</dd></div> : null}
      </dl>

      <div className="plot-details__actions">
        <button className="command-button command-button--primary plot-details__stages" type="button" onClick={() => onOpenStages(plot)}>
          <ListChecks size={18} aria-hidden="true" />
          {t("stagesButton", { done: completedStages.length, total: plotStatuses.length })}
        </button>
        <button className="command-button" type="button" onClick={() => onDocuments(plot)}>
          <FileText size={18} aria-hidden="true" />
          {t("documents")}
        </button>
        <button className="command-button" type="button" onClick={() => onOpenCard(plot)} title={t("openCard")}>
          <ExternalLink size={18} aria-hidden="true" />
          {t("card")}
        </button>
      </div>
    </div>
  );
}
