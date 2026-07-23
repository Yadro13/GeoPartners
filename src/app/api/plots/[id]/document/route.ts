import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { getDocument } from "@/lib/document-storage";
import { getDataWorkspace } from "@/lib/data-workspace";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const workspace = await getDataWorkspace();
  const { id } = await params; const [record] = await db.select({ key: plot.pdfObjectKey, cadastral: plot.cadastralNumber }).from(plot).where(and(eq(plot.workspace, workspace), eq(plot.id, id))).limit(1);
  if (!record?.key) return NextResponse.json({ error: "PDF не прикріплено." }, { status: 404 });
  try {
    const body = await getDocument(record.key);
    return new NextResponse(new Uint8Array(body), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${record.cadastral.replaceAll(":", "")}.pdf"`, "cache-control": "private, max-age=300" } });
  } catch { return NextResponse.json({ error: "Документ не знайдено у сховищі." }, { status: 404 }); }
}
