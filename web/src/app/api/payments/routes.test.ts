import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), requireUserForRead: vi.fn(), get: vi.fn(), create: vi.fn(), accept: vi.fn(), verify: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser, requireUserForRead: mocks.requireUserForRead }));
vi.mock("@/lib/api/handler", () => ({ withErrorHandling: (handler: unknown) => handler }));
vi.mock("@/lib/services/payments", () => ({ getMembershipCheckout: mocks.get, createMembershipOrder: mocks.create, acceptSepayWebhook: mocks.accept, verifySepayAuthorization: mocks.verify }));

import { GET as membership } from "./membership/route";
import { POST as create } from "./orders/route";
import { GET as status } from "./orders/[orderId]/route";
import { POST as webhook } from "./sepay/webhook/route";
import { Unauthorized } from "@/lib/api/response";
const request = () => new NextRequest("https://example.test/api/payments/orders", { method: "POST" });
const context = { params: Promise.resolve({ orderId: "EWP0123456789ABCDEF0123" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ uid: "user" });
  mocks.requireUserForRead.mockResolvedValue({ uid: "user" });
});

it("authenticates all checkout routes before accessing payment data", async () => {
  mocks.requireUser.mockRejectedValue(Unauthorized());
  mocks.requireUserForRead.mockRejectedValue(Unauthorized());
  await expect(membership(request(), context)).rejects.toMatchObject({ status: 401 });
  await expect(create(request(), context)).rejects.toMatchObject({ status: 401 });
  await expect(status(request(), context)).rejects.toMatchObject({ status: 401 });
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("uses authenticated identity and ignores client supplied price and identity", async () => {
  const req = new NextRequest("https://example.test/api/payments/orders", { method: "POST", body: JSON.stringify({ uid: "admin", amount: 1, tier: "PREMIUM" }) });
  await create(req, context);
  expect(mocks.create).toHaveBeenCalledWith("user");
  await status(request(), context);
  expect(mocks.get).toHaveBeenCalledWith("user", "EWP0123456789ABCDEF0123");
});

it("returns SePay raw 201 success and allows retries for operational failures", async () => {
  const req = () => new NextRequest("https://example.test/api/payments/sepay/webhook", { method: "POST", headers: { Authorization: "Apikey secret" }, body: "{}" });
  const success = await webhook(req());
  expect(success.status).toBe(201);
  expect(await success.json()).toEqual({ success: true });
  expect(mocks.verify).toHaveBeenCalledWith("Apikey secret");
  mocks.accept.mockRejectedValue(new Error("storage failure"));
  expect((await webhook(req())).status).toBe(500);
  mocks.verify.mockImplementation(() => { throw Unauthorized(); });
  mocks.accept.mockClear();
  expect((await webhook(req())).status).toBe(401);
  expect(mocks.accept).not.toHaveBeenCalled();
});
