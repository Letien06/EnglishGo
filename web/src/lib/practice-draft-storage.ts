export function practiceDraftKey(uid: string, sessionKey: string) {
  return `practice:${encodeURIComponent(uid)}:${sessionKey}`;
}

export function readPracticeDraft(uid: string, sessionKey: string, serverPayload: string, startedAtMillis: number): string {
  let candidate = serverPayload || "{}";
  const parse = (raw: string) => { try { return JSON.parse(raw); } catch { return null; } };
  try {
    const key = practiceDraftKey(uid, sessionKey);
    let local = localStorage.getItem(key);
    if (!local) {
      const legacyKey = `practice:${sessionKey}`;
      const legacy = localStorage.getItem(legacyKey);
      // Ownerless legacy answers are retained, but never assigned to whoever
      // signs in next on a shared browser.
      if (legacy && parse(legacy)?.ownerUid === uid) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(legacyKey);
        local = legacy;
      }
    }
    const saved = local && parse(local);
    const server = parse(candidate);
    if (saved?.ownerUid === uid && saved.startedAtMillis === startedAtMillis &&
      Number(saved.updatedAtMillis) > Number(server?.updatedAtMillis ?? 0)) candidate = local!;
    const prefix = `practice-pending:${encodeURIComponent(uid)}:${sessionKey}:${startedAtMillis}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const pendingKey = localStorage.key(i);
      if (!pendingKey?.startsWith(prefix)) continue;
      const pending = parse(localStorage.getItem(pendingKey) ?? "null");
      const payload = typeof pending?.payload === "string" ? parse(pending.payload) : null;
      if (payload?.ownerUid === uid && payload.startedAtMillis === startedAtMillis &&
        Number(payload.updatedAtMillis) > Number(parse(candidate)?.updatedAtMillis ?? 0)) candidate = pending.payload;
    }
  } catch { /* Server draft still works when device storage is unavailable. */ }
  return candidate;
}
