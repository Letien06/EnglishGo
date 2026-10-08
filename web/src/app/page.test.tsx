import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getReadIdentity: mocks.identity }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("@/components/PublicHeader", () => ({ default: () => <header>ENGLISHGO</header> }));
import HomePage from "./page";

beforeEach(() => { vi.resetAllMocks(); });
describe("homepage cold-load auth path", () => {
  it("renders the public page without reading a Firestore profile", async () => {
    mocks.identity.mockResolvedValue(null);
    render(await HomePage());
    expect(screen.getAllByRole("link", { name: /Bắt đầu/ }).length).toBeGreaterThan(0);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("continues redirecting authenticated users when profiles are available", async () => {
    mocks.identity.mockResolvedValue({ uid: "learner" });
    await HomePage();
    expect(mocks.redirect).toHaveBeenCalledWith("/hub");
  });
  it("does not hide unrelated programming or configuration errors", async () => {
    mocks.identity.mockRejectedValue(new Error("Missing environment variable"));
    await expect(HomePage()).rejects.toThrow("Missing environment variable");
  });
});
