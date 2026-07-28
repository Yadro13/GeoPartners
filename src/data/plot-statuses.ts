export type PlotStatusDefinition = {
  id: string;
  name: string;
};

export const defaultPlotStatuses: PlotStatusDefinition[] = [
  { id: "status_01", name: "обрана ділянка як варіант" },
  { id: "status_02", name: "проведено перемовини з власником" },
  { id: "status_03", name: "отримана згода власника" },
  { id: "status_04", name: "проведено перемовини з орендарем" },
  { id: "status_05", name: "отримано усну згоду орендаря" },
  { id: "status_06", name: "отримано письмову згоду орендаря" },
  { id: "status_07", name: "отримано схему поділу ділянки" },
  { id: "status_08", name: "на виправленні помилок в ДЗК" },
  { id: "status_09", name: "передано землевпоряднику на поділ" },
  { id: "status_10", name: "поділ ділянки на реєстрації" },
  { id: "status_11", name: "нові ділянки на реєстрації права власності" },
  { id: "status_12", name: "підписано угоду про розірвання оренди" },
  { id: "status_13", name: "угода про розірвання оренди на реєстрації" },
  { id: "status_14", name: "передано нотаріусу для угоди" },
  { id: "status_15", name: "ділянка під ВЕУ викуплена" },
];
