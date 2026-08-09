import { plotResultTypes, type PlotResultType } from "../lib/plot-result-links.ts";

export const plotStatusScopes = ["plots", ...plotResultTypes] as const;
export type PlotStatusScope = (typeof plotStatusScopes)[number];

export type PlotStatusDefinition = {
  id: string;
  name: string;
  scope: PlotStatusScope;
};

const baseNames = [
  "обрана ділянка як варіант",
  "проведено перемовини з власником",
  "отримана згода власника",
  "проведено перемовини з орендарем",
  "отримано усну згоду орендаря",
  "отримано письмову згоду орендаря",
  "отримано схему поділу ділянки",
  "на виправленні помилок в ДЗК",
  "передано землевпоряднику на поділ",
  "поділ ділянки на реєстрації",
  "нові ділянки на реєстрації права власності",
  "підписано угоду про розірвання оренди",
  "угода про розірвання оренди на реєстрації",
  "передано нотаріусу для угоди",
  "ділянка під ВЕУ викуплена",
] as const;

const purposeChangeNames = [
  "розробка проекту щодо зміни ЦП",
  "рішення сесії про зміну ЦП",
  "зміна ЦП зареєстрована",
] as const;

const roadNames = [
  ...baseNames.slice(0, 9),
  "передано землевпоряднику для формування (для ком. вл.)",
  "поділ ділянки на реєстрації",
  "ділянка на реєстрації (для ком. вл.)",
  "нові ділянки на реєстрації права власності",
  "ТД щодо формування ділянки на затвердженні (для ком. вл.)",
  ...baseNames.slice(11),
  ...purposeChangeNames,
  "договір оренди на підписанні (для ком. вл.)",
  "договір оренди зареєстровано (для ком. вл.)",
] as const;

const servitudeNames = [
  ...baseNames.slice(0, 5),
  "отримано схему поділу ділянки",
  "на виправленні помилок в ДЗК",
  "підписано договір сервітуту",
  "передано землевпоряднику на виготовлення ТД",
  "ТД на погодженні",
  "ТД на реєстрації",
  "договір сервітуту зареєстровано",
] as const;

function definitions(scope: PlotStatusScope, names: readonly string[]) {
  const prefix = scope === "plots" ? "status" : `${scope}_status`;
  return names.map((name, index): PlotStatusDefinition => ({
    id: `${prefix}_${String(index + 1).padStart(2, "0")}`,
    name,
    scope,
  }));
}

export const defaultPlotStatusDirectories: Record<PlotStatusScope, PlotStatusDefinition[]> = {
  plots: definitions("plots", baseNames),
  wtg: definitions("wtg", [...baseNames, ...purposeChangeNames]),
  road: definitions("road", roadNames),
  servitude: definitions("servitude", servitudeNames),
  substation: definitions("substation", [...baseNames, ...purposeChangeNames]),
};

export const defaultPlotStatuses = plotStatusScopes.flatMap((scope) => defaultPlotStatusDirectories[scope]);

export function statusesForScope(statuses: PlotStatusDefinition[], scope: PlotStatusScope | PlotResultType) {
  return statuses.filter((status) => status.scope === scope);
}

export function normalizePlotStatusDefinitions(statuses: PlotStatusDefinition[]) {
  return statuses.map((status) => ({ ...status, scope: plotStatusScopes.includes(status.scope) ? status.scope : "plots" as const }));
}
