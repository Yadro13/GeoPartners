import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { resolveDataWorkspace, type DataWorkspace } from "@/lib/data-workspace-selection";

export type { DataWorkspace } from "@/lib/data-workspace-selection";

export const workspaceCookieName = "geopartners-data-workspace";

export async function getWorkspaceContext(preferredWorkspace?: DataWorkspace | null): Promise<{ workspace: DataWorkspace; testWorkspaceEnabled: boolean }> {
  const [[settings], cookieStore] = await Promise.all([
    db.select({ testWorkspaceEnabled: appSettings.testWorkspaceEnabled }).from(appSettings).where(eq(appSettings.id, "global")).limit(1),
    cookies(),
  ]);
  const testWorkspaceEnabled = settings?.testWorkspaceEnabled ?? true;
  const requested = preferredWorkspace === undefined ? cookieStore.get(workspaceCookieName)?.value : preferredWorkspace;
  return {
    workspace: resolveDataWorkspace(testWorkspaceEnabled, requested),
    testWorkspaceEnabled,
  };
}

export async function getDataWorkspace(preferredWorkspace?: DataWorkspace | null) {
  return (await getWorkspaceContext(preferredWorkspace)).workspace;
}

export function workspaceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  };
}
