export const locales = ["uk", "de", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "uk";
export const localeCookieName = "GP_LOCALE";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && locales.includes(value as AppLocale);
}

export function intlLocale(locale: AppLocale) {
  return locale === "uk" ? "uk-UA" : locale === "de" ? "de-DE" : "en-GB";
}
