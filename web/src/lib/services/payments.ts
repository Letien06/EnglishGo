import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firestore/db";
import { ApiError, BadRequest, NotFound, TooManyRequests, Unauthorized } from "@/lib/api/response";
import type { MembershipCheckout, MembershipStatus, PaymentOrder } from "@/types/payments";

const ORDER_PATTERN = /^EWP[A-F0-9]{20}$/;
const LIFETIME_MS = 30 * 60 * 1000;
type StoredOrder = PaymentOrder & { uid: string; gateway: string };

export function paymentConfig() {
  const value = (key: string) => process.env[key]?.trim() ?? "";
  const amount = Number(value("SEPAY_PREMIUM_AMOUNT") || "2000");
  const bankName = value("SEPAY_BANK_CODE");
  const accountNumber = value("SEPAY_BANK_ACCOUNT_NUMBER");
  const accountName = value("SEPAY_BANK_ACCOUNT_NAME");
  const secret = value("SEPAY_WEBHOOK_API_KEY");
  const validAmount = Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000;
  return { amount: validAmount ? amount : 2000, bankName, gateway: value("SEPAY_BANK_GATEWAY") || bankName, accountNumber, accountName, secret,
    available: Boolean(validAmount && bankName && accountNumber && accountName && secret) };
}

export function verifySepayAuthorization(authorization: string | null): void {
  const secret = paymentConfig().secret;
  if (!secret) throw new ApiError("Payment webhook is not configured", 503);
  const supplied = authorization?.match(/^Apikey (.+)$/i)?.[1] ?? "";
  // Fixed length digests keep comparison timing independent of secret length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(secret))) throw Unauthorized();
}

function membership(data: Record<string, unknown> | undefined): MembershipStatus {
  return { tier: data?.tier === "PREMIUM" ? "PREMIUM" : "FREE",
    activatedAt: typeof data?.activatedAt === "string" ? data.activatedAt : null };
}

function publicOrder(order: StoredOrder, now = Date.now()): PaymentOrder {
  return {
    id: order.id,
    status: order.status === "PENDING" && Date.parse(order.expiresAt) <= now ? "EXPIRED" : order.status,
    amount: order.amount,
    transferContent: order.transferContent,
    qrUrl: order.qrUrl,
    bankName: order.bankName,
    accountNumber: order.accountNumber,
    accountName: order.accountName,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
  };
}

function checkoutOrder(order: StoredOrder, config: ReturnType<typeof paymentConfig>, now = Date.now()): PaymentOrder {
  const result = publicOrder(order, now);
  if (result.status === "PENDING" && (!config.available || order.amount !== config.amount
    || order.bankName !== config.bankName || order.accountNumber !== config.accountNumber
    || order.accountName !== config.accountName || normalizeGateway(order.gateway) !== normalizeGateway(config.gateway))) {
    return { ...result, status: "EXPIRED" };
  }
  return result;
}

export async function getMembershipCheckout(uid: string, orderId?: string): Promise<MembershipCheckout> {
  const config = paymentConfig();
  const snap = await adminDb.collection("userMemberships").doc(uid).get();
  const data = snap.data();
  const id = orderId ?? data?.pendingOrderId;
  let order: PaymentOrder | null = null;
  if (typeof id === "string") {
    if (!ORDER_PATTERN.test(id)) throw NotFound("Payment order not found");
    const orderSnap = await adminDb.collection("paymentOrders").doc(id).get();
    const stored = orderSnap.data() as StoredOrder | undefined;
    if (orderId && (!stored || stored.uid !== uid)) throw NotFound("Payment order not found");
    if (stored?.uid === uid) order = checkoutOrder(stored, config);
  }
  return { membership: membership(data), order, available: config.available, amount: config.amount };
}

export async function createMembershipOrder(uid: string): Promise<MembershipCheckout> {
  const config = paymentConfig();
  if (!config.available) throw new ApiError("Payment checkout is not configured", 503);
  const now = Date.now();
  const id = `EWP${randomBytes(10).toString("hex").toUpperCase()}`;
  const memberRef = adminDb.collection("userMemberships").doc(uid);
  const orderRef = adminDb.collection("paymentOrders").doc(id);
  return adminDb.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    const data = memberSnap.data();
    const currentMembership = membership(data);
    const result = (order: PaymentOrder | null): MembershipCheckout => ({ membership: currentMembership, order, available: true, amount: config.amount });
    if (currentMembership.tier === "PREMIUM") return result(null);
    if (typeof data?.pendingOrderId === "string" && ORDER_PATTERN.test(data.pendingOrderId)) {
      const pending = (await tx.get(adminDb.collection("paymentOrders").doc(data.pendingOrderId))).data() as StoredOrder | undefined;
      if (pending?.uid === uid && checkoutOrder(pending, config, now).status === "PENDING") return result(checkoutOrder(pending, config, now));
    }
    const day = new Date(now).toISOString().slice(0, 10);
    const count = data?.orderDay === day && typeof data?.orderCount === "number" ? data.orderCount : 0;
    if (count >= 10) throw TooManyRequests("Daily payment order limit reached", 3600, 10);
    const qr = new URL("https://vietqr.app/img");
    for (const [key, value] of Object.entries({ acc: config.accountNumber, bank: config.bankName, amount: String(config.amount), des: id, holder: config.accountName })) qr.searchParams.set(key, value);
    const order: StoredOrder = { id, uid, gateway: config.gateway, status: "PENDING", amount: config.amount, transferContent: id,
      qrUrl: qr.toString(), bankName: config.bankName, accountNumber: config.accountNumber, accountName: config.accountName,
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + LIFETIME_MS).toISOString(), paidAt: null };
    tx.create(orderRef, order);
    tx.set(memberRef, { pendingOrderId: id, orderDay: day, orderCount: count + 1 }, { merge: true });
    return result(publicOrder(order, now));
  });
}

export function extractPaymentCode(payload: Record<string, unknown>): string | null {
  const content = typeof payload.content === "string" && payload.content.length <= 10_000 ? payload.content.toUpperCase() : "";
  const codes = [...content.matchAll(/(?<![A-Z0-9])EWP[A-F0-9]{20}(?![A-Z0-9])/g)].map((match) => match[0]);
  const code = typeof payload.code === "string" ? payload.code.toUpperCase() : "";
  if (code && !ORDER_PATTERN.test(code)) return null;
  if (code) codes.push(code);
  const unique = [...new Set(codes)];
  return unique.length === 1 ? unique[0] : null;
}

export async function acceptSepayWebhook(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw BadRequest("Invalid webhook payload");
  const input = payload as Record<string, unknown>;
  // SePay's dashboard connectivity test uses ID 0. Acknowledge it without
  // treating the sample as a real bank transaction.
  if (input.id === 0 || input.id === "0") return;
  const id = typeof input.id === "number" && Number.isSafeInteger(input.id) && input.id > 0 ? String(input.id)
    : typeof input.id === "string" && /^[1-9][0-9]{0,29}$/.test(input.id) ? input.id : null;
  if (!id) throw BadRequest("Invalid transaction ID");
  const code = extractPaymentCode(input);
  if (!code || input.transferType !== "in" || typeof input.transferAmount !== "number" || !Number.isSafeInteger(input.transferAmount)) return;
  const transferredAt = parseSepayTransactionDate(input.transactionDate);
  if (transferredAt === null) return;
  const transactionRef = adminDb.collection("sepayTransactions").doc(id);
  const orderRef = adminDb.collection("paymentOrders").doc(code);
  const now = Date.now();
  await adminDb.runTransaction(async (tx) => {
    const transactionSnap = await tx.get(transactionRef);
    if (transactionSnap.exists) return;
    const orderSnap = await tx.get(orderRef);
    const order = orderSnap.data() as StoredOrder | undefined;
    if (!order || order.status !== "PENDING" || transferredAt < Math.floor(Date.parse(order.createdAt) / 1000) * 1000
      || transferredAt >= Date.parse(order.expiresAt) || transferredAt > now + 60_000
      || normalizeGateway(input.gateway) !== normalizeGateway(order.gateway)
      || input.accountNumber !== order.accountNumber || input.transferAmount !== order.amount) return;
    const memberRef = adminDb.collection("userMemberships").doc(order.uid);
    const memberSnap = await tx.get(memberRef);
    const activatedAt = membership(memberSnap.data()).activatedAt ?? new Date(transferredAt).toISOString();
    tx.create(transactionRef, { orderId: code, uid: order.uid, amount: order.amount, receivedAt: new Date(now).toISOString() });
    tx.update(orderRef, { status: "PAID", paidAt: new Date(transferredAt).toISOString(), transactionId: id });
    tx.set(memberRef, { tier: "PREMIUM", activatedAt }, { merge: true });
  });
}

function normalizeGateway(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "mb" ? "mbbank" : normalized;
}

export function parseSepayTransactionDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value.replace(" ", "T")}+07:00`);
  if (!Number.isFinite(parsed)) return null;
  const roundTrip = new Date(parsed + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  return roundTrip === value ? parsed : null;
}
