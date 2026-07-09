const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|token|cookie|authorization|password|private[_-]?key)/i;

export function logInfo(event: string, context?: Record<string, unknown>): void {
  console.info(JSON.stringify(redact({ event, ...context })));
}

export function logWarn(event: string, context?: Record<string, unknown>): void {
  console.warn(JSON.stringify(redact({ event, ...context })));
}

export function logServerError(event: string, error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    event,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  };
  console.error(JSON.stringify(redact(payload)));
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(item),
    ]),
  );
}
