import { cookies } from "next/headers";
import { defaultLocale, isAppLocale, localeCookieName, type AppLocale } from "./config";

export async function getRequestLocale(): Promise<AppLocale> {
  try {
    const value = (await cookies()).get(localeCookieName)?.value;
    return isAppLocale(value) ? value : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export function normalizeAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : defaultLocale;
}
