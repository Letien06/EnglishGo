import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeaderJoinRoomButton from "./HeaderJoinRoomButton";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockPush.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HeaderJoinRoomButton", () => {
  it("renders trigger button and opens dialog when clicked", () => {
    render(<HeaderJoinRoomButton />);
    const trigger = screen.getByTestId("header-join-room-button");
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Nhập mã phòng" })).toBeInTheDocument();
  });

  it("closes dialog on Cancel button click or Escape key", () => {
    render(<HeaderJoinRoomButton />);
    fireEvent.click(screen.getByTestId("header-join-room-button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen and close via Escape
    fireEvent.click(screen.getByTestId("header-join-room-button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("validates 6 characters and displays error if room does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })));
    render(<HeaderJoinRoomButton />);
    fireEvent.click(screen.getByTestId("header-join-room-button"));

    const input = screen.getByPlaceholderText("VD: 7CWB2A");
    fireEvent.change(input, { target: { value: "notfnd" } });
    expect(input).toHaveValue("NOTFND");

    fireEvent.click(screen.getByRole("button", { name: "Vào phòng" }));
    await screen.findByText("Mã phòng không tồn tại hoặc đã kết thúc");
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("redirects to target room on valid code and closes modal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { room: { code: "ABC123", vocabSetId: 5, gameMode: "rain" } },
          }),
          { status: 200 }
        )
      )
    );
    render(<HeaderJoinRoomButton />);
    fireEvent.click(screen.getByTestId("header-join-room-button"));

    const input = screen.getByPlaceholderText("VD: 7CWB2A");
    fireEvent.change(input, { target: { value: "abc123" } });
    expect(input).toHaveValue("ABC123");

    fireEvent.click(screen.getByRole("button", { name: "Vào phòng" }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/vocab/5/flashcards?mode=rain&tab=play&room=ABC123");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
