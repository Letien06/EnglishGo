import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompanionEncouragement from "./CompanionEncouragement";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("companion encouragement", () => {
  it("keeps encouragement visible and cycles through eight messages without a learning link", () => {
    render(<CompanionEncouragement />);
    const bubble = screen.getByRole("complementary", { name: "Lời động viên" });
    expect(bubble).toHaveTextContent("Mình luôn ở đây cổ vũ bạn.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const messages = new Set<string>();
    for (let count = 0; count < 8; count++) {
      messages.add(bubble.querySelector("p")!.textContent!);
      fireEvent.click(screen.getByRole("button", { name: "Lời động viên tiếp theo" }));
    }
    expect(messages.size).toBe(8);
    expect(bubble).toHaveTextContent("Cùng học thêm một chút hôm nay nhé!");
  });

  it("gives a manually selected message a full reading interval and cleans up on exit", () => {
    const { unmount } = render(<CompanionEncouragement />);
    act(() => vi.advanceTimersByTime(19_000));
    fireEvent.click(screen.getByRole("button", { name: "Lời động viên tiếp theo" }));
    const second = screen.getByRole("complementary").querySelector("p")!.textContent;
    act(() => vi.advanceTimersByTime(19_000));
    expect(screen.getByRole("complementary").querySelector("p")!.textContent).toBe(second);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("complementary").querySelector("p")!.textContent).not.toBe(second);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pauses automatic changes in hidden tabs and honors reduced motion while allowing manual changes", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<CompanionEncouragement />);
    act(() => vi.advanceTimersByTime(40_000));
    expect(screen.getByText("Cùng học thêm một chút hôm nay nhé!")).toBeInTheDocument();
    visibility.mockReturnValue("visible");
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    act(() => vi.advanceTimersByTime(40_000));
    expect(screen.getByText("Cùng học thêm một chút hôm nay nhé!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lời động viên tiếp theo" }));
    expect(screen.getByText("Mỗi từ mới hôm nay là một bước gần hơn đến mục tiêu của bạn.")).toBeInTheDocument();
  });
});
