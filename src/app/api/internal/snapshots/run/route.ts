import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runWorkspaceSnapshotSchedule } from "@/lib/workspace-snapshots";

export async function POST(request: Request) {
  const configuredSecret = process.env.SNAPSHOT_CRON_SECRET ?? "";
  const providedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configuredSecret || !secretsMatch(configuredSecret, providedSecret)) {
    return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { force?: unknown };
  const force = body.force === true && process.env.STAGING_INTEGRATION_ENABLED === "true";
  const result = await runWorkspaceSnapshotSchedule({ force });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
