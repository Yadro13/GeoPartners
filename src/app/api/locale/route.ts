import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { isAppLocale, localeCookieName } from "@/i18n/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  if (!isAppLocale(body?.locale)) return NextResponse.json({ error: "Unsupported locale." }, { status: 400 });

  const store = await cookies();
  store.set(localeCookieName, body.locale, { httpOnly: false, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  const hasSession = store.getAll().some(({ name }) => name.includes("session_token"));
  if (hasSession) {
    const currentUser = await getCurrentUser();
    if (currentUser) await db.update(user).set({ locale: body.locale }).where(eq(user.id, currentUser.id));
  }
  return NextResponse.json({ locale: body.locale });
}
