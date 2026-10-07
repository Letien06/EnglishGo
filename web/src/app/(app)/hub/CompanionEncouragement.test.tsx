import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompanionEncouragement from "./CompanionEncouragement";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function quote() { return screen.getByRole("complementary").querySelector('p[aria-hidden="false"]')!.textContent; }

describe("companion encouragement", () => {
  it("starts deterministically, changes at five seconds, and wraps all eight messages", () => {
    render(<CompanionEncouragement />);
    const first = quote();
    expect(first).toBe("Cùng học thêm một chút hôm nay nhé!");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(quote()).toBe(first);
    act(() => vi.advanceTimersByTime(1));
    expect(quote()).toBe("Mỗi từ mới hôm nay là một bước gần hơn đến mục tiêu của bạn.");
    const messages = new Set([first, quote()]);
    for (let count = 0; count < 6; count++) {
      act(() => vi.advanceTimersByTime(5_000));
      messages.add(quote());
    }
    expect(messages.size).toBe(8);
    act(() => vi.advanceTimersByTime(5_000));
    expect(quote()).toBe(first);
    expect(vi.getTimerCount()).toBe(1);
  });
  it("pauses while hidden and restarts a full interval on return", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<CompanionEncouragement />);
    act(() => vi.advanceTimersByTime(4_000));
    const first = quote();
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(30_000));
    expect(quote()).toBe(first);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(4_999));
    expect(quote()).toBe(first);
    act(() => vi.advanceTimersByTime(1));
    expect(quote()).not.toBe(first);
  });
  it("starts paused when hidden and cleans up timer and visibility listener on exit", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<CompanionEncouragement />);
    expect(vi.getTimerCount()).toBe(0);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    fireEvent(document, new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
