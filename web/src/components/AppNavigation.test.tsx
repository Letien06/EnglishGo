import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";
import AppSidebar from "./AppSidebar";
import MobileNavigationMenu from "./MobileNavigationMenu";

const navigation = vi.hoisted(() => ({ pathname: "/hub" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("./IntentLink", () => ({ default: ({ children, onClick, ...props }: React.ComponentProps<"a">) => <a {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }}>{children}</a> }));
vi.mock("./ThemeToggle", () => ({ default: () => <button>Đổi giao diện</button> }));
vi.mock("./PwaInstallPrompt", () => ({ default: () => null }));
vi.mock("./HeaderJoinRoomButton", () => ({ default: () => null }));
vi.mock("./StudyStreakBadge", () => ({ default: () => null }));
vi.mock("@/lib/vocab-review-queue", () => ({ useVocabReviewQueue: () => ({}) }));

beforeEach(() => {
  navigation.pathname = "/hub";
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { authenticated: false, user: null } }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("app navigation", () => {
  it("makes Home the first desktop entry and removes the separate progress feature", async () => {
    render(<AppShell><main>Trang học</main></AppShell>);
    const links = within(screen.getByRole("navigation", { name: "Điều hướng học tập" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Trang chủ");
    expect(links[0]).toHaveAttribute("href", "/hub");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Tiến bộ" })).not.toBeInTheDocument();
    expect(links.map((link) => link.getAttribute("href"))).not.toContain("/progress");
    await act(async () => undefined);
  });

  it("makes Home the first mobile entry and still closes after navigation", () => {
    render(<MobileNavigationMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Mở điều hướng" }));
    const links = within(screen.getByRole("navigation", { name: "Điều hướng chính" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Trang chủ");
    expect(links[0]).toHaveAttribute("href", "/hub");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Tiến bộ" })).not.toBeInTheDocument();
    fireEvent.click(links[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes progress from the sidebar while preserving module destinations", () => {
    render(<AppSidebar />);
    const links = within(screen.getByRole("navigation", { name: "Điều hướng chính" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Trang chủ");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/hub", "/listen", "/read", "/vocab", "/practice", "/community"]);
    expect(screen.queryByRole("link", { name: "Tiến bộ" })).not.toBeInTheDocument();
  });
});
