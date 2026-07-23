import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";

export default async function UiPreviewPage({ searchParams }: { searchParams: Promise<{ role?: string; google?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role, google } = await searchParams;
  return <Workspace preview googleEnabled={google === "1"} user={role === "user" ? { name: "Демо Користувач", email: "user@example.com", role: "user" } : undefined} />;
}
