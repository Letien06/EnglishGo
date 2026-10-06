import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserForRead: mocks.user }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/PublicHeader", () => ({ default: () => <header>ENGLISHGO</header> }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
import HomePage from "./page";

beforeEach(() => { vi.resetAllMocks(); });
describe("homepage database outage recovery", () => {
  it("renders the public page and an honest notice when a signed-in profile hits quota", async () => {
    mocks.user.mockRejectedValue(Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 }));
    render(await HomePage());
    expect(screen.getByRole("status")).toHaveTextContent("Dữ liệu học tập đang tạm gián đoạn");
    expect(screen.getAllByRole("link", { name: /Bắt đầu/ }).length).toBeGreaterThan(0);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("continues redirecting authenticated users when profiles are available", async () => {
    mocks.user.mockResolvedValue({ uid: "learner" });
    await HomePage();
    expect(mocks.redirect).toHaveBeenCalledWith("/hub");
  });
  it("does not hide unrelated programming or configuration errors", async () => {
    mocks.user.mockRejectedValue(new Error("Missing environment variable"));
    await expect(HomePage()).rejects.toThrow("Missing environment variable");
  });
});
