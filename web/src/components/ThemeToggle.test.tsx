import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";

beforeEach(() => {
  vi.stubGlobal("React", React);
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("shared theme control", () => {
  it("defaults to dark with no manual preference or DOM theme", () => {
    delete document.documentElement.dataset.theme;
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Chuyển sang giao diện sáng" })).toHaveAttribute("aria-pressed", "true");
  });
  it("preserves an explicit light preference", () => {
    delete document.documentElement.dataset.theme;
    localStorage.setItem("englishgo-theme", "light");
    localStorage.setItem("englishgo-theme-manual", "1");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Chuyển sang giao diện tối" })).toHaveAttribute("aria-pressed", "false");
  });
  it("falls back to dark when storage is unavailable", () => {
    delete document.documentElement.dataset.theme;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Chuyển sang giao diện sáng" })).toBeInTheDocument();
  });
  it("keeps multiple controls and persisted preference in sync", () => {
    render(<><ThemeToggle /><ThemeToggle /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Chuyển sang giao diện tối" })[0]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("englishgo-theme")).toBe("dark");
    expect(screen.getAllByRole("button", { name: "Chuyển sang giao diện sáng" })).toHaveLength(2);
  });

  it("hydrates a saved light theme without resetting it or mismatching dark server markup", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemeToggle />);
    document.body.append(container);
    document.documentElement.dataset.theme = "light";
    let root!: Root;
    await act(async () => { root = hydrateRoot(container, <ThemeToggle />); });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Chuyển sang giao diện tối" })).toHaveAttribute("aria-pressed", "false");
    expect(errors).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
