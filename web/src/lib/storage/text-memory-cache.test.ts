import { describe, expect, it, vi } from "vitest";
import { createTextMemoryCache } from "./text-memory-cache";

describe("bounded material memory cache", () => {
  it("coalesces concurrent loads", async () => {
    const cache = createTextMemoryCache(100, 5);
    const loader = vi.fn(async () => "payload");
    expect(await Promise.all([cache.get("same", loader), cache.get("same", loader)])).toEqual(["payload", "payload"]);
    await cache.get("same", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used value at the entry limit", async () => {
    const cache = createTextMemoryCache(100, 2);
    const loader = vi.fn(async () => "value");
    await cache.get("old", loader);
    await cache.get("warm", loader);
    await cache.get("old", loader);
    await cache.get("new", loader);
    await cache.get("old", loader);
    expect(loader).toHaveBeenCalledTimes(3);
    await cache.get("warm", loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("bounds UTF-8 bytes and skips oversized values", async () => {
    const cache = createTextMemoryCache(4, 10);
    const loader = vi.fn(async () => "éé");
    await cache.get("first", loader);
    await cache.get("second", loader);
    await cache.get("first", loader);
    expect(loader).toHaveBeenCalledTimes(3);
    const large = vi.fn(async () => "12345");
    await cache.get("large", large);
    await cache.get("large", large);
    expect(large).toHaveBeenCalledTimes(2);
  });

  it("retries rejected loads", async () => {
    const cache = createTextMemoryCache(100, 2);
    const loader = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    await expect(cache.get("key", loader)).rejects.toThrow("offline");
    await expect(cache.get("key", loader)).resolves.toBe("recovered");
  });
});
