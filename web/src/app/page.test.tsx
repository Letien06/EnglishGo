import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), redirect: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getReadIdentity: mocks.identity }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("@/components/PublicHeader", () => ({ default: () => <header>ENGLISHGO</header> }));
import HomePage from "./page";

beforeEach(() => { vi.resetAllMocks(); mocks.cookies.mockResolvedValue({ get: () => undefined }); });
describe("homepage cold-load auth path", () => {
  it("renders the public page without reading a Firestore profile", async () => {
    render(await HomePage());
    expect(screen.getAllByRole("link", { name: /Bắt đầu/ }).length).toBeGreaterThan(0);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects quickly when a session cookie is present", async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    mocks.cookies.mockResolvedValue({ get: (name: string) => name === "session" ? { value: `header.${payload}.signature` } : undefined });
    await HomePage();
    expect(mocks.redirect).toHaveBeenCalledWith("/hub");
  });
  it("does not hide unrelated programming or configuration errors", async () => {
    mocks.cookies.mockRejectedValue(new Error("Cookie storage unavailable"));
    await expect(HomePage()).rejects.toThrow("Cookie storage unavailable");
  });
});
