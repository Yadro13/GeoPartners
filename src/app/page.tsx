import { redirect } from "next/navigation";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { Workspace } from "@/components/workspace/Workspace";
import { getCurrentUser } from "@/lib/access";
import { db } from "@/db";
import { category, plot, plotStatus } from "@/db/schema";
import { categoryRowsToRecord, plotRowToFeature } from "@/lib/plots";
import { getWorkspaceContext } from "@/lib/data-workspace";
import { normalizeAppLocale } from "@/i18n/server-locale";
import type { WorkspaceSection } from "@/components/workspace/types";

const workspaceSections = new Set<WorkspaceSection>(["map", "layers", "reports", "history", "users", "settings", "profile"]);

export default async function HomePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await connection();
  const { section } = await searchParams;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  if (currentUser.approvalStatus !== "approved") redirect("/pending");
  const { workspace, testWorkspaceEnabled } = await getWorkspaceContext();
  const [plotRows, categoryRows, statusRows] = await Promise.all([
    db.select().from(plot).where(eq(plot.workspace, workspace)),
    db.select().from(category).where(eq(category.workspace, workspace)),
    db.select({ id: plotStatus.id, name: plotStatus.name }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.sortOrder)),
  ]);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const requestedSection = workspaceSections.has(section as WorkspaceSection) ? section as WorkspaceSection : "map";
  const initialSection = requestedSection === "users" && currentUser.role !== "admin" ? "map" : requestedSection;
  return <Workspace initialPlots={plotRows.map(plotRowToFeature)} initialCategories={categoryRowsToRecord(categoryRows)} initialPlotStatuses={statusRows} initialSection={initialSection} user={{ name: currentUser.name, email: currentUser.email, role: currentUser.role, accessLevel: currentUser.accessLevel, locale: normalizeAppLocale(currentUser.locale) }} googleEnabled={googleEnabled} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} />;
}
