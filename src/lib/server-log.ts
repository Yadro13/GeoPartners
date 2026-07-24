type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined | Date;

const sensitiveField = /(email|recipient|name|token|secret|password|payload|content|document|cadastral|owner|lessee|url|object.?key)/i;

export function serverLog(level: LogLevel, event: string, fields: Record<string, LogValue> = {}) {
  const safeFields: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (sensitiveField.test(key) || value === undefined) continue;
    safeFields[key] = value instanceof Date ? value.toISOString() : value;
  }

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "geopartners-web",
    event,
    ...safeFields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function errorFields(error: unknown) {
  const candidate = error as { name?: unknown; code?: unknown };
  return {
    errorType: typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "UnknownError",
    errorCode: typeof candidate?.code === "string" || typeof candidate?.code === "number"
      ? String(candidate.code).slice(0, 80)
      : undefined,
  };
}
