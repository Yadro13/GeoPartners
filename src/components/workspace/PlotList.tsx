import { ChevronRight, MapPin } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { CategoryDefinition } from "@/data/demo";
import { areaUnit } from "@/lib/localized-values";
import type { PlotFeature } from "./types";

type PlotListProps = {
  plots: PlotFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  categories: Record<string, CategoryDefinition>;
};

export function PlotList({ plots, selectedId, onSelect, categories }: PlotListProps) {
  const t = useTranslations("plotList");
  const format = useFormatter();
  const locale = useLocale();
  if (plots.length === 0) {
    return <div className="plot-list-empty">{t("empty")}</div>;
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
              <small>{format.number(properties.areaHa, { maximumFractionDigits: 4 })} {areaUnit(locale)}</small>
            </span>
            <ChevronRight className="plot-row__arrow" aria-hidden="true" size={18} />
          </button>
        );
      })}
    </div>
  );
}
