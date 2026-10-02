export function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])) } };
  throw new Error("Only finite JSON values and timestamps can be archived.");
}

export function createJsonCommitter(projectId, credential, fetcher = fetch) {
  const database = `projects/${projectId}/databases/(default)`;
  return async (documents) => {
    if (documents.length === 0) return;
    const writes = documents.map(({ path, data, create = false, merge = false }) => {
      const segments = path.split("/");
      if (!["dauEnglishSnapshots", "dauToeicMirror", "dauToeicSyncStatus"].includes(segments[0]) || segments.length % 2 !== 0 || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Importer cannot write outside its material collections.");
      return {
        update: { name: `${database}/documents/${path}`, fields: firestoreValue(data).mapValue.fields },
        ...(create ? { currentDocument: { exists: false } } : {}),
        ...(merge ? { updateMask: { fieldPaths: Object.keys(data) } } : {}),
      };
    });
    const body = JSON.stringify({ writes });
    if (documents.length > 500 || Buffer.byteLength(body, "utf8") > 9_000_000) throw new Error("Material commit exceeds the safe atomic request size.");
    const token = await credential.getAccessToken();
    const response = await fetcher(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(`Firestore ${response.status}: ${body?.error?.status ?? "WRITE_FAILED"}: ${body?.error?.message ?? "Material write failed"}`);
    }
  };
}
