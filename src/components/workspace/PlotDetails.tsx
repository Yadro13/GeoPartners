import { ExternalLink, FileText, Pencil } from "lucide-react";
import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "./types";

type PlotDetailsProps = {
  plot: PlotFeature | null;
  compact?: boolean;
  categories: Record<string, CategoryDefinition>;
  onEdit: (plot: PlotFeature) => void;
  onDocuments: (plot: PlotFeature) => void;
  onOpenCard: (plot: PlotFeature) => void;
};

export function PlotDetails({ plot, compact = false, categories, onEdit, onDocuments, onOpenCard }: PlotDetailsProps) {
  if (!plot) {
    return <div className="plot-details-empty">Оберіть ділянку на карті або у списку.</div>;
  }

  const { properties } = plot;
  const category = categories[properties.category] ?? categories.default ?? { name: properties.category, color: "#2f86a6" };

  return (
    <div className="plot-details" data-compact={compact}>
      <header className="plot-details__header">
        <div>
          <span className="eyebrow">Кадастровий номер</span>
          <h2>{properties.cadastralNumber}</h2>
        </div>
        <button className="icon-button" type="button" onClick={() => onEdit(plot)} title="Редагувати ділянку" aria-label="Редагувати ділянку">
          <Pencil size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="category-line">
        <span className="category-line__swatch" style={{ background: category.color }} />
        {category.name}
      </div>

      <dl className="details-grid">
        <div><dt>Площа</dt><dd>{properties.areaHa.toLocaleString("uk-UA", { maximumFractionDigits: 4 })} га</dd></div>
        {properties.status ? <div><dt>Статус</dt><dd>{properties.status}</dd></div> : null}
        <div><dt>Власник</dt><dd>{properties.owner}</dd></div>
        <div><dt>Орендар</dt><dd>{properties.lessee}</dd></div>
      </dl>

      <div className="plot-details__actions">
        <button className="command-button command-button--primary" type="button" onClick={() => onDocuments(plot)}>
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
