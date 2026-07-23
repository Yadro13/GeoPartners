import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export type DataWorkspace = "production" | "sandbox";

export const workspaceCookieName = "geopartners-data-workspace";

export async function getWorkspaceContext(): Promise<{ workspace: DataWorkspace; testWorkspaceEnabled: boolean }> {
  const [[settings], cookieStore] = await Promise.all([
    db.select({ testWorkspaceEnabled: appSettings.testWorkspaceEnabled }).from(appSettings).where(eq(appSettings.id, "global")).limit(1),
    cookies(),
  ]);
  const testWorkspaceEnabled = settings?.testWorkspaceEnabled ?? true;
  const requested = cookieStore.get(workspaceCookieName)?.value;
  return {
    workspace: testWorkspaceEnabled && requested === "sandbox" ? "sandbox" : "production",
    testWorkspaceEnabled,
  };
}

export async function getDataWorkspace() {
  return (await getWorkspaceContext()).workspace;
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
