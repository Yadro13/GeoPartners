import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { readPdfBuffer, validateUploadFiles } from "@/lib/import-upload";
import { parseLandDocument } from "@/lib/pdf-metadata";
import { hasPermission } from "@/lib/permissions";
import { errorFields, serverLog } from "@/lib/server-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (process.env.NODE_ENV === "production") {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
    if (!hasPermission(currentUser, "imports.run")) return NextResponse.json({ error: "Імпорт доступний лише адміністратору." }, { status: 403 });
  }
  try {
    const form = await request.formData(); const files = form.getAll("files").filter((value): value is File => value instanceof File);
    validateUploadFiles(files, "pdf");
    serverLog("info", "import.inspect.started", { fileCount: files.length });
    const documents = await Promise.all(files.map(async (file) => ({ name: file.name, stem: file.name.replace(/\.pdf$/i, "").toLocaleLowerCase(), metadata: await parseLandDocument(await readPdfBuffer(file)) })));
    serverLog("info", "import.inspect.completed", { fileCount: files.length, durationMs: Date.now() - startedAt });
    return NextResponse.json({ documents });
  } catch (error) {
    serverLog("error", "import.inspect.failed", { durationMs: Date.now() - startedAt, ...errorFields(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося прочитати PDF." }, { status: 400 });
  }
}
