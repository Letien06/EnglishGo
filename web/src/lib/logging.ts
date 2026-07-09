export function logServerError(event: string, error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    event,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  };
  console.error(JSON.stringify(payload));
}
