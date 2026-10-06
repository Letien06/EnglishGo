/** Admin gRPC uses code 8; Firestore REST uses HTTP 429. */
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown; details?: unknown };
  return value.code === 8 || value.code === 429 || value.code === "resource-exhausted" ||
    [value.message, value.details].some((text) => typeof text === "string" &&
      /RESOURCE_EXHAUSTED|Quota exceeded/i.test(text));
}
