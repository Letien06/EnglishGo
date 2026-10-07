import { describe, expect, it, vi } from "vitest";
import ContinuePage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  requireUserForRead: vi.fn(),
  getContinueLearning: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireUserForRead: mocks.requireUserForRead }));
vi.mock("@/lib/services/continue-learning", () => ({ getContinueLearning: mocks.getContinueLearning }));

describe("legacy continue route", () => {
  it("redirects to Home without authenticating or reading resume data", () => {
    expect(() => ContinuePage()).toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/hub");
    expect(mocks.requireUserForRead).not.toHaveBeenCalled();
    expect(mocks.getContinueLearning).not.toHaveBeenCalled();
  });
});
