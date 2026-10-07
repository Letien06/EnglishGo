import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WritingHistoryClient from "./WritingHistoryClient";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps history metrics unknown until history arrives and reserves submission rows", async () => {
  vi.stubGlobal("React", React);
  let resolveHistory!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveHistory = resolve; })));
  render(<WritingHistoryClient />);
  expect(screen.getByText("Bài đã nộp").closest("article")).toHaveTextContent("—");
  expect(screen.getByText("Dạng đã luyện").closest("article")).toHaveTextContent("—");
  expect(screen.getByRole("status", { name: "Đang tải lịch sử" })).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("Chưa có bài viết nào ở đây")).not.toBeInTheDocument();
  await act(async () => resolveHistory(new Response(JSON.stringify({ success: true, data: [] }))));
  expect(screen.getByText("Bài đã nộp").closest("article")).toHaveTextContent("0");
  expect(screen.getByText("Dạng đã luyện").closest("article")).toHaveTextContent("0/3");
  expect(screen.getByText("Chưa có bài viết nào ở đây")).toBeInTheDocument();
});
