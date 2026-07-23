import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, category, plot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { deleteDocument } from "@/lib/document-storage";
import { hasPermission } from "@/lib/permissions";

export async function DELETE() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "workspaces.manage")) return NextResponse.json({ error: "Очищення тестової бази доступне лише адміністратору." }, { status: 403 });

  const documents = await db.select({ key: plot.pdfObjectKey }).from(plot).where(eq(plot.workspace, "sandbox"));
  const documentResults = await Promise.allSettled(documents.flatMap(({ key }) => key ? [deleteDocument(key)] : []));
  const [deletedPlots, deletedAudit, deletedCategories] = await db.transaction(async (tx) => {
    const plotRows = await tx.delete(plot).where(eq(plot.workspace, "sandbox")).returning({ id: plot.id });
    const auditRows = await tx.delete(auditLog).where(eq(auditLog.workspace, "sandbox")).returning({ id: auditLog.id });
    const categoryRows = await tx.delete(category).where(eq(category.workspace, "sandbox")).returning({ id: category.id });
    return [plotRows.length, auditRows.length, categoryRows.length] as const;
  });
  const documentErrors = documentResults.filter(({ status }) => status === "rejected").length;
  return NextResponse.json({ deletedPlots, deletedAudit, deletedCategories, documentErrors });
}
