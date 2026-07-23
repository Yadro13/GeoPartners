import { ChevronRight, MapPin } from "lucide-react";
import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "./types";

type PlotListProps = {
  plots: PlotFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  categories: Record<string, CategoryDefinition>;
};

export function PlotList({ plots, selectedId, onSelect, categories }: PlotListProps) {
  if (plots.length === 0) {
    return <div className="plot-list-empty">За цим запитом ділянок не знайдено.</div>;
  }

  return (
    <div className="plot-list" role="list">
      {plots.map(({ properties }) => {
        const category = categories[properties.category] ?? categories.default ?? { name: properties.category, color: "#2f86a6" };
        const selected = selectedId === properties.id;
        return (
          <button
            className="plot-row"
            data-selected={selected}
            key={properties.id}
            onClick={() => onSelect(properties.id)}
            type="button"
            role="listitem"
          >
            <span className="plot-row__marker" style={{ backgroundColor: category.color }}>
              <MapPin aria-hidden="true" size={16} />
            </span>
            <span className="plot-row__body">
              <strong>{properties.cadastralNumber}</strong>
              <span>{category.name}</span>
              <small>{properties.areaHa.toLocaleString("uk-UA", { maximumFractionDigits: 4 })} га</small>
            </span>
            <ChevronRight className="plot-row__arrow" aria-hidden="true" size={18} />
          </button>
        );
      })}
    </div>
  );
}
