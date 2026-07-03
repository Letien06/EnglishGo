import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";

export const PLAN_PRICES = {
  FREE: 0,
  PREMIUM_MONTHLY: 99000,
  PREMIUM_YEARLY: 899000,
} as const;

export type PlanId = keyof typeof PLAN_PRICES;

export interface SubscriptionView {
  planId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface TransactionView {
  id: string;
  amount: number;
  provider: string;
  status: string;
  createdAtMillis: number | null;
}

export function plans() {
  return PLAN_PRICES;
}

export async function activeSubscription(uid: string | null): Promise<SubscriptionView | null> {
  if (!uid) return null;
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("subscriptions")
    .get();
  return snap.docs
    .filter((doc) => String(doc.get("status") ?? "").toUpperCase() === "ACTIVE")
    .map(toSubscription)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
    .at(0) ?? null;
}

export async function recentTransactions(uid: string | null): Promise<TransactionView[]> {
  if (!uid) return [];
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("transactions")
    .get();
  return snap.docs
    .map(toTransaction)
    .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0))
    .slice(0, 10);
}

export async function checkout(
  uid: string | null,
  planId: string,
  provider: string,
): Promise<TransactionView> {
  if (!uid) throw Unauthorized("User not found");
  if (!isPlanId(planId)) throw BadRequest("Unknown plan");
  const cleanProvider = provider.trim().toUpperCase() || "MANUAL";
  const start = new Date();
  const end = new Date(start);
  if (planId === "PREMIUM_YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  const transactionData = {
    amount: PLAN_PRICES[planId],
    provider: cleanProvider,
    status: "PAID",
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await adminDb
    .collection("users")
    .doc(uid)
    .collection("transactions")
    .add(transactionData);

  await adminDb
    .collection("users")
    .doc(uid)
    .collection("subscriptions")
    .doc("current")
    .set({
      planId,
      startDate: dateOnly(start),
      endDate: dateOnly(end),
      status: "ACTIVE",
      updatedAt: FieldValue.serverTimestamp(),
    });

  return { id: ref.id, ...transactionData };
}

function toSubscription(doc: FirebaseFirestore.DocumentSnapshot): SubscriptionView {
  return {
    planId: stringValue(doc.get("planId")) ?? "FREE",
    status: stringValue(doc.get("status")) ?? "ACTIVE",
    startDate: stringValue(doc.get("startDate")),
    endDate: stringValue(doc.get("endDate")),
  };
}

function toTransaction(doc: FirebaseFirestore.DocumentSnapshot): TransactionView {
  return {
    id: doc.id,
    amount: numberValue(doc.get("amount")) ?? 0,
    provider: stringValue(doc.get("provider")) ?? "MANUAL",
    status: stringValue(doc.get("status")) ?? "PAID",
    createdAtMillis: numberValue(doc.get("createdAtMillis")),
  };
}

function isPlanId(value: string): value is PlanId {
  return Object.prototype.hasOwnProperty.call(PLAN_PRICES, value);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
