import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const control = vi.hoisted(() => ({ fail: false, tail: Promise.resolve() }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}`, get: async () => snapshot(`${collection}/${id}`) }) }),
  runTransaction: (callback: (tx: unknown) => Promise<unknown>) => {
    const run = control.tail.then(async () => {
      if (control.fail) throw new Error("database unavailable");
      const writes: (() => void)[] = [];
      const value = await callback({
        get: async (ref: { path: string }) => snapshot(ref.path),
        create: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => { if (store.has(ref.path)) throw new Error("exists"); store.set(ref.path, data); }),
        set: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
        update: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      writes.forEach((write) => write());
      return value;
    });
    control.tail = run.then(() => undefined, () => undefined);
    return run;
  },
} }));

function snapshot(path: string) {
  const data = store.get(path);
  return { exists: Boolean(data), data: () => data };
}

import { acceptSepayWebhook, createMembershipOrder, extractPaymentCode, getMembershipCheckout, paymentConfig, verifySepayAuthorization } from "./payments";
const code = "EWP0123456789ABCDEF0123";
const now = new Date("2026-11-08T00:00:00Z").getTime();
const payload = () => ({ id: 42, gateway: "Vietcombank", transactionDate: "2026-11-08 07:00:00", accountNumber: "123456", transferType: "in", transferAmount: 1000, content: `payment ${code}`, code: null });

beforeEach(() => {
  store.clear();
  control.fail = false;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SEPAY_BANK_CODE", "Vietcombank");
  vi.stubEnv("SEPAY_BANK_ACCOUNT_NUMBER", "123456");
  vi.stubEnv("SEPAY_BANK_ACCOUNT_NAME", "ACCOUNT OWNER");
  vi.stubEnv("SEPAY_WEBHOOK_API_KEY", "test-secret");
  vi.stubEnv("SEPAY_PREMIUM_AMOUNT", "1000");
  store.set(`paymentOrders/${code}`, { id: code, uid: "learner", gateway: "Vietcombank", amount: 1000, accountNumber: "123456", status: "PENDING", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 60_000).toISOString() });
  store.set("users/learner", { role: "USER", tier: "PREMIUM" });
});

describe("SePay membership payments", () => {
  it("replaces a pending order when the configured amount changes without invalidating its original payment", async () => {
    const original = (await createMembershipOrder("learner")).order!;
    const storedOriginal = { ...store.get(`paymentOrders/${original.id}`) };
    vi.stubEnv("SEPAY_PREMIUM_AMOUNT", "2000");
    expect((await getMembershipCheckout("learner")).order).toMatchObject({ id: original.id, status: "EXPIRED", amount: 1000 });
    const replacement = (await createMembershipOrder("learner")).order!;
    expect(replacement.id).not.toBe(original.id);
    expect(replacement.amount).toBe(2000);
    expect(new URL(replacement.qrUrl).searchParams.get("amount")).toBe("2000");
    expect(store.get(`paymentOrders/${original.id}`)).toEqual(storedOriginal);
    await acceptSepayWebhook({ ...payload(), content: original.id });
    expect(store.get("userMemberships/learner")).toMatchObject({ tier: "PREMIUM" });
    expect(store.get(`paymentOrders/${original.id}`)?.status).toBe("PAID");
  });

  it("uses a 2000 VND default and safe display fallback", () => {
    vi.stubEnv("SEPAY_PREMIUM_AMOUNT", "");
    expect(paymentConfig()).toMatchObject({ amount: 2000, available: true });
    vi.stubEnv("SEPAY_PREMIUM_AMOUNT", "invalid");
    expect(paymentConfig()).toMatchObject({ amount: 2000, available: false });
  });

  it.each([0, "0"])("acknowledges dashboard test ID %j without promoting a matching order", async (id) => {
    await expect(acceptSepayWebhook({ ...payload(), id })).resolves.toBeUndefined();
    expect(store.has("userMemberships/learner")).toBe(false);
    expect(store.get(`paymentOrders/${code}`)?.status).toBe("PENDING");
    expect([...store.keys()].some((key) => key.startsWith("sepayTransactions/"))).toBe(false);
  });

  it("authenticates API keys and fails closed when unconfigured", () => {
    expect(() => verifySepayAuthorization("Apikey test-secret")).not.toThrow();
    for (const header of [null, "Bearer test-secret", "Apikey incorrect"]) expect(() => verifySepayAuthorization(header)).toThrow(expect.objectContaining({ status: 401 }));
    vi.stubEnv("SEPAY_WEBHOOK_API_KEY", "");
    expect(() => verifySepayAuthorization("Apikey test-secret")).toThrow(expect.objectContaining({ status: 503 }));
    expect(paymentConfig().available).toBe(false);
  });

  it("atomically grants membership exactly once for concurrent replays without changing profile roles", async () => {
    await Promise.all(Array.from({ length: 8 }, () => acceptSepayWebhook(payload())));
    expect(store.get("userMemberships/learner")).toMatchObject({ tier: "PREMIUM", activatedAt: new Date(now).toISOString() });
    expect(store.get(`paymentOrders/${code}`)).toMatchObject({ status: "PAID", transactionId: "42" });
    expect([...store.keys()].filter((key) => key.startsWith("sepayTransactions/"))).toHaveLength(1);
    expect(store.get("users/learner")).toEqual({ role: "USER", tier: "PREMIUM" });
  });

  it.each([
    { accountNumber: "wrong" }, { gateway: "OtherBank" }, { transferAmount: 999 }, { transferAmount: 1001 },
    { transactionDate: "2026-02-30 07:00:00" }, { transactionDate: "2026-11-08 06:59:59" },
    { transferType: "out" }, { content: `x${code}` }, { content: `${code}0` },
    { content: `${code} EWPAAAAAAAAAAAAAAAAAAAA` }, { code: "INVALID" },
  ])("ignores mismatched transfers %j", async (changes) => {
    await acceptSepayWebhook({ ...payload(), ...changes });
    expect(store.has("userMemberships/learner")).toBe(false);
    expect(store.has("sepayTransactions/42")).toBe(false);
  });

  it("ignores stale orders and propagates storage failures for retries", async () => {
    vi.setSystemTime(now + 30 * 60_000);
    await acceptSepayWebhook({ ...payload(), transactionDate: "2026-11-08 07:30:00" });
    expect(store.has("userMemberships/learner")).toBe(false);
    control.fail = true;
    await expect(acceptSepayWebhook(payload())).rejects.toThrow("database unavailable");
  });

  it("accepts a timely transfer delivered after order expiry", async () => {
    vi.setSystemTime(now + 60 * 60_000);
    await acceptSepayWebhook(payload());
    expect(store.get("userMemberships/learner")).toMatchObject({ tier: "PREMIUM" });
  });

  it("does not reuse a transaction ID across different orders", async () => {
    await acceptSepayWebhook(payload());
    const second = "EWPAAAAAAAAAAAAAAAAAAAA";
    store.set(`paymentOrders/${second}`, { ...store.get(`paymentOrders/${code}`), id: second, uid: "other", status: "PENDING" });
    await acceptSepayWebhook({ ...payload(), content: second });
    expect(store.has("userMemberships/other")).toBe(false);
  });

  it("creates one pending server priced order for concurrent requests and enforces ownership", async () => {
    const results = await Promise.all([createMembershipOrder("learner"), createMembershipOrder("learner")]);
    expect(results[0].order?.id).toBe(results[1].order?.id);
    expect(results[0].order).toMatchObject({ amount: 1000, accountNumber: "123456", status: "PENDING" });
    expect(results[0].order?.qrUrl).toContain("https://vietqr.app/img?");
    await expect(getMembershipCheckout("other", results[0].order!.id)).rejects.toMatchObject({ status: 404 });
    expect((await getMembershipCheckout("learner")).membership.tier).toBe("FREE");
  });

  it("disables missing account config and limits new orders", async () => {
    vi.stubEnv("SEPAY_BANK_ACCOUNT_NUMBER", "");
    await expect(createMembershipOrder("learner")).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("SEPAY_BANK_ACCOUNT_NUMBER", "123456");
    store.set("userMemberships/learner", { orderDay: "2026-11-08", orderCount: 10 });
    await expect(createMembershipOrder("learner")).rejects.toMatchObject({ status: 429 });
  });

  it("rejects malformed IDs and ambiguous codes", async () => {
    await expect(acceptSepayWebhook({ ...payload(), id: "../42" })).rejects.toMatchObject({ status: 400 });
    expect(extractPaymentCode({ content: code, code: "EWPAAAAAAAAAAAAAAAAAAAA" })).toBeNull();
  });
});
