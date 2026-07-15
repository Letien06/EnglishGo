import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientRequestTimeoutError, fetchWithTimeout } from "./client-request";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("aborts a request that exceeds its user-facing deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const request = fetchWithTimeout("/api/example", {}, 200);
    const assertion = expect(request).rejects.toBeInstanceOf(ClientRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
  });
});
