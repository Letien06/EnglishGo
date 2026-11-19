import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MembershipPanel from "./MembershipPanel";
import type { MembershipCheckout, PaymentOrder } from "@/types/payments";

vi.mock("next/image", () => ({ default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
  void unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...props} />;
} }));

const order: PaymentOrder = {
  id: "order-one", status: "PENDING", amount: 2300, transferContent: "EGTEST123",
  qrUrl: "https://qr.sepay.vn/img?test=1", bankName: "Test bank", accountNumber: "123456789",
  accountName: "TEST ACCOUNT", createdAt: "2026-11-08T01:00:00Z", expiresAt: "2026-11-08T01:30:00Z", paidAt: null,
};
const free: MembershipCheckout = { membership: { tier: "FREE", activatedAt: null }, order: null, available: true, amount: 2300 };
const response = (data: MembershipCheckout) => new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("membership transfer flow", () => {
  it("keeps the account free after creating an order and upgrades only from the server confirmation", async () => {
    let serverState = free;
    let completeOrder!: (response: Response) => void;
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { completeOrder = resolve; });
      return Promise.resolve(response(serverState));
    });
    vi.stubGlobal("fetch", fetch);
    render(<MembershipPanel />);
    const create = await screen.findByRole("button", { name: "Tạo mã chuyển khoản thử" });
    expect(screen.getByText("Thường")).toBeInTheDocument();
    fireEvent.click(create);
    expect(screen.getByText("Thường")).toBeInTheDocument();
    expect(screen.queryByText("Premium", { exact: true })).not.toBeInTheDocument();
    serverState = { ...free, order };
    completeOrder(response(serverState));
    expect(await screen.findByText("EGTEST123")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Kiểm tra trạng thái" })).toBeEnabled());
    expect(screen.getByText("Thường")).toBeInTheDocument();
    expect(screen.getByText(/Số tiền chuyển khoản thử:/)).toHaveTextContent("2.300");
    serverState = { ...serverState, membership: { tier: "PREMIUM", activatedAt: "2026-11-08T01:01:00Z" }, order: { ...order, status: "PAID", paidAt: "2026-11-08T01:01:00Z" } };
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra trạng thái" }));
    expect(await screen.findByText("Premium", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("EGTEST123")).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url === "/api/payments/orders/order-one")).toBe(true);
  });

  it("offers a retry after an initial failure and disables checkout when unconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Mất kết nối")).mockResolvedValueOnce(response({ ...free, available: false })));
    render(<MembershipPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại kiểm tra" }));
    expect(await screen.findByText(/Chuyển khoản thử chưa được cấu hình/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo mã chuyển khoản thử" })).not.toBeInTheDocument();
  });
});
