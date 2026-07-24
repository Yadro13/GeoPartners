import { sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox } from "@/db/schema";

export type NotificationQueueSummary = {
  state: "ok" | "processing" | "attention";
  pending: number;
  failed: number;
  exhausted: number;
  due: number;
  oldestUnsentAt: string | null;
  checkedAt: string;
};

export async function getNotificationQueueSummary(): Promise<NotificationQueueSummary> {
  const [row] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    failed: sql<number>`count(*) filter (where status = 'failed' and attempts::integer < 6)::int`,
    exhausted: sql<number>`count(*) filter (where status = 'failed' and attempts::integer >= 6)::int`,
    due: sql<number>`count(*) filter (where status in ('pending', 'failed') and next_attempt_at <= now() and attempts::integer < 6)::int`,
    oldestUnsentAt: sql<Date | null>`min(created_at) filter (where status <> 'sent')`,
  }).from(notificationOutbox);

  const pending = Number(row?.pending ?? 0);
  const failed = Number(row?.failed ?? 0);
  const exhausted = Number(row?.exhausted ?? 0);
  const due = Number(row?.due ?? 0);
  return {
    state: exhausted > 0 || failed > 0 ? "attention" : pending > 0 ? "processing" : "ok",
    pending,
    failed,
    exhausted,
    due,
    oldestUnsentAt: row?.oldestUnsentAt ? new Date(row.oldestUnsentAt).toISOString() : null,
    checkedAt: new Date().toISOString(),
  };
}
