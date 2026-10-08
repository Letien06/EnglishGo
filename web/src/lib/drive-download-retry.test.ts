import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readDriveTextWithRetry } from "../../scripts/lib/drive-download-retry.mjs";

class DriveError extends Error {
  constructor(public status: number) { super(`Drive request failed (${status})`); }
}
const options = () => ({ DriveError, timeoutMs: 120_000, wait: vi.fn(async () => undefined) });

describe("build Drive download retries", () => {
  it.each([new DOMException("Timed out", "TimeoutError"), new DriveError(429), new DriveError(503), new TypeError("fetch failed")])("retries a transient error then returns valid data with explicit download timeout", async (error) => {
    const client = { readText: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("verified text") };
    const config = options();
    expect(await readDriveTextWithRetry(client, "file", 700_000, config)).toBe("verified text");
    expect(client.readText).toHaveBeenCalledTimes(2);
    expect(client.readText).toHaveBeenCalledWith("file", 700_000, 120_000);
    expect(config.wait).toHaveBeenCalledWith(500);
  });

  it.each([401, 403, 404, 400])("does not retry authorization or permanent HTTP %s", async (status) => {
    const client = { readText: vi.fn().mockRejectedValue(new DriveError(status)) };
    const config = options();
    await expect(readDriveTextWithRetry(client, "file", 100, config)).rejects.toMatchObject({ status });
    expect(client.readText).toHaveBeenCalledTimes(1);
    expect(config.wait).not.toHaveBeenCalled();
  });

  it("caps retries at three attempts and preserves the last transport error", async () => {
    const error = new DriveError(500);
    const client = { readText: vi.fn().mockRejectedValue(error) };
    const config = options();
    await expect(readDriveTextWithRetry(client, "file", 100, config)).rejects.toBe(error);
    expect(client.readText).toHaveBeenCalledTimes(3);
    expect(config.wait.mock.calls).toEqual([[500], [1000]]);
  });

  it.each([new Error("Drive material exceeds its size limit."), new TypeError("Invalid application value"), new Error("Content bundle chunk checksum mismatch.")])("does not retry size, validation or unrelated TypeErrors", async (error) => {
    const client = { readText: vi.fn().mockRejectedValue(error) };
    const config = options();
    await expect(readDriveTextWithRetry(client, "file", 100, config)).rejects.toBe(error);
    expect(client.readText).toHaveBeenCalledTimes(1);
  });

  it("keeps checksum verification outside transport retries", async () => {
    const client = { readText: vi.fn().mockResolvedValue("corrupt bytes") };
    const config = options();
    const expected = createHash("sha256").update("valid bytes").digest("hex");
    const load = async () => {
      const text = await readDriveTextWithRetry(client, "file", 100, config);
      if (createHash("sha256").update(text).digest("hex") !== expected) throw new Error("Checksum mismatch");
    };
    await expect(load()).rejects.toThrow("Checksum mismatch");
    expect(client.readText).toHaveBeenCalledTimes(1);
    expect(config.wait).not.toHaveBeenCalled();
  });
});
