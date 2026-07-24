import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { getNotificationQueueSummary } from "@/lib/notification-monitor";
import { errorFields, serverLog } from "@/lib/server-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (currentUser.role !== "admin") return NextResponse.json({ error: "Моніторинг сповіщень доступний лише адміністратору." }, { status: 403 });

  try {
    return NextResponse.json(await getNotificationQueueSummary(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    serverLog("error", "notifications.status.failed", errorFields(error));
    return NextResponse.json({ error: "Не вдалося перевірити чергу сповіщень." }, { status: 503 });
  }
}
