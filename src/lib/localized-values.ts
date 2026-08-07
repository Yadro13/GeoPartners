export function areaUnit(locale: string) {
  return locale.toLocaleLowerCase().startsWith("uk") ? "га" : "ha";
}

export function normalizeDocumentDate(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  const localizedDate = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!localizedDate) return "";
  return `${localizedDate[3]}-${localizedDate[2].padStart(2, "0")}-${localizedDate[1].padStart(2, "0")}`;
}

export function documentDateForDisplay(value: unknown) {
  const date = normalizeDocumentDate(value);
  return date ? new Date(`${date}T12:00:00`) : null;
}
