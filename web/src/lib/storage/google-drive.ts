export interface DriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class DriveError extends Error {
  constructor(readonly status: number, operation: string) {
    super(`Google Drive ${operation} failed (${status}). Check API access, authorization, and quota.`);
  }
}

export function driveFileId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(value)) throw new Error("Invalid Google Drive file ID.");
  return value;
}

export function createDriveClient(credentials: DriveCredentials, fetcher: typeof fetch = fetch) {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new Error("Google Drive OAuth credentials are not configured.");
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    if (!pendingToken) {
      pendingToken = (async () => {
        const response = await fetcher("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new DriveError(response.status, "token refresh");
        const result = await response.json() as { access_token?: string; expires_in?: number };
        if (!result.access_token || !Number.isFinite(result.expires_in) || Number(result.expires_in) <= 0) throw new Error("Google returned an invalid Drive token response.");
        token = { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in) * 1000 };
        return token.value;
      })().finally(() => { pendingToken = undefined; });
    }
    return pendingToken;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, "https://www.googleapis.com");
    if (url.origin !== "https://www.googleapis.com" || !/^\/(?:upload\/)?drive\/v3\/(?:files(?:\/|$)|about$)/.test(url.pathname)) throw new Error("Drive credentials can only be sent to the Drive API.");
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${await accessToken()}`);
      const response = await fetcher(url.toString(), { ...init, headers, cache: "no-store", redirect: "error", signal: init.signal ?? AbortSignal.timeout(15_000) });
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel();
        token = undefined;
        continue;
      }
      if (!response.ok) throw new DriveError(response.status, "request");
      return response;
    }
    throw new DriveError(401, "authorization");
  }

  async function readText(fileId: string, maxBytes: number, timeoutMs = 15_000): Promise<string> {
    const response = await request(`/drive/v3/files/${driveFileId(fileId)}?alt=media`, { signal: AbortSignal.timeout(timeoutMs) });
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw new Error("Drive material exceeds its size limit.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Drive returned an empty response.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new Error("Drive material exceeds its size limit.");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  }

  return { request, readText };
}
