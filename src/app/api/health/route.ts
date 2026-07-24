import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { getNotificationQueueSummary } from "@/lib/notification-monitor";
import { errorFields, serverLog } from "@/lib/server-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [, notifications] = await Promise.all([
      Promise.race([
        db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Database health check timed out.")), 3000)),
      ]),
      getNotificationQueueSummary(),
    ]);
    return NextResponse.json({
      status: notifications.state === "attention" ? "degraded" : "ok",
      service: "geopartners",
      database: "ok",
      notifications: notifications.state,
      storageConfigured: Boolean(
        process.env.AWS_ENDPOINT_URL
        && process.env.AWS_ACCESS_KEY_ID
        && process.env.AWS_SECRET_ACCESS_KEY
        && process.env.AWS_S3_BUCKET_NAME,
      ),
    });
  } catch (error) {
    serverLog("error", "health.failed", errorFields(error));
    return NextResponse.json({
      status: "degraded",
      service: "geopartners",
      database: "unavailable",
    }, { status: 503 });
  }
}
