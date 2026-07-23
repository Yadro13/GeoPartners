import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { parseLandDocument } from "@/lib/pdf-metadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  }
  try {
    const form = await request.formData(); const files = form.getAll("files").filter((value): value is File => value instanceof File && /\.pdf$/i.test(value.name));
    const documents = await Promise.all(files.map(async (file) => ({ name: file.name, stem: file.name.replace(/\.pdf$/i, "").toLocaleLowerCase(), metadata: await parseLandDocument(Buffer.from(await file.arrayBuffer())) })));
    return NextResponse.json({ documents });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося прочитати PDF." }, { status: 400 }); }
}
