import { ExternalLink, FileText, ListChecks, Pencil } from "lucide-react";
import type { CategoryDefinition } from "@/data/demo";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { totalPlotStatusCost } from "@/lib/plot-status-progress";
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
  if (!plot) {
    return <div className="plot-details-empty">Оберіть ділянку на карті або у списку.</div>;
  }

  const { properties } = plot;
  const category = categories[properties.category] ?? categories.default ?? { name: properties.category, color: "#2f86a6" };
  const completedStages = properties.statusProgress ?? [];
  const totalCost = totalPlotStatusCost(completedStages);

  return (
    <div className="plot-details" data-compact={compact}>
      <header className="plot-details__header">
        <div>
          <span className="eyebrow">Кадастровий номер</span>
          <h2>{properties.cadastralNumber}</h2>
        </div>
        {onEdit ? <button className="icon-button" type="button" onClick={() => onEdit(plot)} title="Редагувати ділянку" aria-label="Редагувати ділянку">
          <Pencil size={18} aria-hidden="true" />
        </button> : null}
      </header>

      <div className="category-line">
        <span className="category-line__swatch" style={{ background: category.color }} />
        {category.name}
      </div>

      <dl className="details-grid">
        <div><dt>Площа</dt><dd>{properties.areaHa.toLocaleString("uk-UA", { maximumFractionDigits: 4 })} га</dd></div>
        <div><dt>Етапи</dt><dd>{completedStages.length} із {plotStatuses.length} пройдено</dd></div>
        {totalCost > 0 ? <div><dt>Загальні витрати</dt><dd>{totalCost.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн</dd></div> : null}
        <div><dt>Власник</dt><dd>{properties.owner}</dd></div>
        <div><dt>Орендар</dt><dd>{properties.lessee}</dd></div>
      </dl>

      <div className="plot-details__actions">
        <button className="command-button command-button--primary plot-details__stages" type="button" onClick={() => onOpenStages(plot)}>
          <ListChecks size={18} aria-hidden="true" />
          Етапи ({completedStages.length}/{plotStatuses.length})
        </button>
        <button className="command-button" type="button" onClick={() => onDocuments(plot)}>
          <FileText size={18} aria-hidden="true" />
          Документи
        </button>
        <button className="command-button" type="button" onClick={() => onOpenCard(plot)} title="Відкрити картку в окремому поданні">
          <ExternalLink size={18} aria-hidden="true" />
          Картка
        </button>
      </div>
    </div>
  );
}
