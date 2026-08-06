"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DataWorkspace } from "@/lib/data-workspace";
import type { BaseMapId } from "./types";
import { AuditPanel } from "./AuditPanel";
import { SnapshotHistoryPanel } from "./SnapshotHistoryPanel";

export function HistoryPanel({ preview, baseMap, isAdmin, onRestore, workspace }: { preview: boolean; baseMap: BaseMapId; isAdmin: boolean; onRestore: (id: string) => Promise<void>; workspace: DataWorkspace }) {
  const t = useTranslations("snapshotHistory"); const [view, setView] = useState<"audit" | "snapshots">("audit");
  return <div className="history-page-shell">{isAdmin ? <div className="history-view-switch segmented-control" role="group" aria-label={t("viewMode")}><button type="button" data-active={view === "audit"} onClick={() => setView("audit")}>{t("audit")}</button><button type="button" data-active={view === "snapshots"} onClick={() => setView("snapshots")}>{t("snapshots")}</button></div> : null}{view === "snapshots" && isAdmin ? <SnapshotHistoryPanel preview={preview} baseMap={baseMap} workspace={workspace} /> : <AuditPanel preview={preview} baseMap={baseMap} canRestore={isAdmin} onRestore={onRestore} workspace={workspace} />}</div>;
}
