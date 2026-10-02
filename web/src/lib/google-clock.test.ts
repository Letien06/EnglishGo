import { afterEach, describe, expect, it, vi } from "vitest";
import { alignGoogleClock } from "../../scripts/lib/google-clock.mjs";

afterEach(() => vi.useRealTimers());

describe("standalone sync clock alignment", () => {
  it("corrects the process clock without changing explicit timestamps and restores it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T05:00:00Z"));
    const originalDate = Date;
    const remoteTime = "Fri, 02 Oct 2026 12:00:00 GMT";
    const clock = await alignGoogleClock(vi.fn().mockResolvedValue(new Response(null, { headers: { date: remoteTime } })));
    try {
      expect(clock.offsetMs).toBe(7 * 60 * 60 * 1000);
      expect(Date.now()).toBe(originalDate.parse(remoteTime));
      expect(new Date().toISOString()).toBe("2026-10-02T12:00:00.000Z");
      expect(new Date(0).getTime()).toBe(0);
      expect(Date.parse("2026-01-01T00:00:00Z")).toBe(originalDate.parse("2026-01-01T00:00:00Z"));
    } finally {
      clock.restore();
    }
    expect(Date).toBe(originalDate);
    expect(Date.now()).toBe(originalDate.parse("2026-10-02T05:00:00Z"));
  });

  it("leaves an already aligned process alone", async () => {
    const originalDate = Date;
    const clock = await alignGoogleClock(vi.fn().mockResolvedValue(new Response(null, { headers: { date: new Date().toUTCString() } })));
    expect(clock.offsetMs).toBe(0);
    expect(Date).toBe(originalDate);
    clock.restore();
  });

  it("rejects missing or implausible clock references", async () => {
    await expect(alignGoogleClock(vi.fn().mockResolvedValue(new Response()))).rejects.toThrow("clock reference");
    await expect(alignGoogleClock(vi.fn().mockResolvedValue(new Response(null, { headers: { date: "Thu, 01 Jan 1970 00:00:00 GMT" } })))).rejects.toThrow("24 hours");
  });
});
