import type { Feature, Polygon } from "geojson";
import type { PlotProperties } from "@/data/demo";
import type { CategoryDefinition } from "@/data/demo";
import type { DataWorkspace } from "@/lib/data-workspace";

export type PlotFeature = Feature<Polygon, PlotProperties>;

export type WorkspaceSection = "map" | "layers" | "reports" | "history" | "users" | "settings" | "profile";
export type BaseMapId = "streets" | "light" | "satellite";
export type WorkspaceUser = { name: string; email: string; role: "user" | "admin" };

export type WorkspaceActions = {
  select: (id: string) => void;
  setQuery: (query: string) => void;
  setSection: (section: WorkspaceSection) => void;
  openAdd: () => void;
  openEdit: (plot: PlotFeature) => void;
  remove: (plot: PlotFeature) => void;
  openImport: () => void;
  openDocuments: (plot: PlotFeature) => void;
  openCard: (plot: PlotFeature) => void;
  openNotifications: () => void;
  restoreAuditEntry: (id: string) => Promise<void>;
  exportGeoJson: () => void;
  exportCsv: () => void;
  setBaseMap: (baseMap: BaseMapId) => void;
  toggleCategory: (id: string, visible: boolean) => void;
  updateCategory: (id: string, changes: Partial<CategoryDefinition>) => void;
  addCategory: () => void;
  removeCategory: (id: string) => void;
  setWorkspace: (workspace: DataWorkspace) => Promise<void>;
  setTestWorkspaceEnabled: (enabled: boolean) => Promise<void>;
  clearSandbox: () => Promise<void>;
};

export type WorkspaceViewProps = {
  plots: PlotFeature[];
  selectedPlot: PlotFeature | null;
  selectedId: string | null;
  query: string;
  categories: Record<string, CategoryDefinition>;
  activeSection: WorkspaceSection;
  baseMap: BaseMapId;
  user: WorkspaceUser;
  googleEnabled: boolean;
  preview: boolean;
  workspace: DataWorkspace;
  testWorkspaceEnabled: boolean;
  actions: WorkspaceActions;
};
