import { setTimeout as delay } from "node:timers/promises";

export function isTransientDriveDownload(error, DriveError) {
  if (error instanceof DriveError) return error.status === 429 || (error.status >= 500 && error.status <= 599);
  if (error?.name === "TimeoutError") return true;
  return error instanceof TypeError && /fetch failed|failed to fetch|networkerror|network request failed/i.test(error.message);
}

/** Three bounded attempts apply only to transport failures, before validation. */
export async function readDriveTextWithRetry(client, fileId, maxBytes, { DriveError, timeoutMs = 120_000, wait = (milliseconds) => delay(milliseconds) }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await client.readText(fileId, maxBytes, timeoutMs); }
    catch (error) {
      if (attempt === 2 || !isTransientDriveDownload(error, DriveError)) throw error;
      await wait(500 * (attempt + 1));
    }
  }
}
