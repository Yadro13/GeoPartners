const kyivTimeZone = "Europe/Kyiv";

export const snapshotRetentionDays = 90;

export function getKyivSnapshotSchedule(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: kyivTimeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    due: values.weekday === "Fri" && values.hour === "23",
    scheduleKey: `${values.year}-${values.month}-${values.day}`,
  };
}

export function snapshotRetentionCutoff(now: Date) {
  return new Date(now.getTime() - snapshotRetentionDays * 24 * 60 * 60 * 1000);
}
