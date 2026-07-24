const sensitiveField = /(email|recipient|name|token|secret|password|payload|content|document|cadastral|owner|lessee|url|object.?key)/i;

export function structuredLog(service, level, event, fields = {}) {
  const safeFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (sensitiveField.test(key) || value === undefined) continue;
    safeFields[key] = value instanceof Date ? value.toISOString() : value;
  }

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service,
    event,
    ...safeFields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function structuredError(error) {
  return {
    errorType: typeof error?.name === "string" ? error.name.slice(0, 80) : "UnknownError",
    errorCode: typeof error?.code === "string" || typeof error?.code === "number"
      ? String(error.code).slice(0, 80)
      : undefined,
  };
}
