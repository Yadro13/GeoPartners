import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "./auth";

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  return currentUser ?? null;
}

export async function requireAdmin(callbackPath: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect(`/sign-in?callbackURL=${encodeURIComponent(callbackPath)}`);
  if (currentUser.role !== "admin" || currentUser.approvalStatus !== "approved") redirect("/pending");
  return currentUser;
}
