import { describe, expect, it, vi } from "vitest";
import ProgressPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  requireUserForRead: vi.fn(),
  getProgressReport: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireUserForRead: mocks.requireUserForRead }));
vi.mock("@/lib/services/progress-report", () => ({ getProgressReport: mocks.getProgressReport }));

describe("legacy progress route", () => {
  it("redirects to Home without reading student reports or requiring authentication", () => {
    expect(() => ProgressPage()).toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/hub");
    expect(mocks.requireUserForRead).not.toHaveBeenCalled();
    expect(mocks.getProgressReport).not.toHaveBeenCalled();
  });
});
