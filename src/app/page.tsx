import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { Workspace } from "@/components/workspace/Workspace";
import { getCurrentUser } from "@/lib/access";
import { db } from "@/db";
import { category, plot } from "@/db/schema";
import { categoryRowsToRecord, plotRowToFeature } from "@/lib/plots";
import { getWorkspaceContext } from "@/lib/data-workspace";

export default async function HomePage() {
  await connection();
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  if (currentUser.approvalStatus !== "approved") redirect("/pending");
  const { workspace, testWorkspaceEnabled } = await getWorkspaceContext();
  const [plotRows, categoryRows] = await Promise.all([
    db.select().from(plot).where(eq(plot.workspace, workspace)),
    db.select().from(category).where(eq(category.workspace, workspace)),
  ]);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <Workspace initialPlots={plotRows.map(plotRowToFeature)} initialCategories={categoryRowsToRecord(categoryRows)} user={{ name: currentUser.name, email: currentUser.email, role: currentUser.role }} googleEnabled={googleEnabled} workspace={workspace} testWorkspaceEnabled={testWorkspaceEnabled} />;
}
