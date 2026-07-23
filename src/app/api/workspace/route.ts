import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/access";
import { getWorkspaceContext, workspaceCookieName, workspaceCookieOptions } from "@/lib/data-workspace";

const bodySchema = z.object({ workspace: z.enum(["production", "sandbox"]) });

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Невідома область даних." }, { status: 400 });
  const context = await getWorkspaceContext();
  if (parsed.data.workspace === "sandbox" && !context.testWorkspaceEnabled) return NextResponse.json({ error: "Тестову базу вимкнено адміністратором." }, { status: 403 });
  const response = NextResponse.json({ workspace: parsed.data.workspace });
  response.cookies.set(workspaceCookieName, parsed.data.workspace, workspaceCookieOptions());
  return response;
}
