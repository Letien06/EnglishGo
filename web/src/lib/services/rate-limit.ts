import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest } from "@/lib/api/response";

export async function enforceDailyActionLimit(
  uid: string,
  action: string,
  maxPerDay: number,
): Promise<void> {
  const safeAction = action.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (!uid || !safeAction || maxPerDay <= 0) throw BadRequest("Invalid rate limit");
  const dateKey = dateKeyFor(Date.now());
  const ref = adminDb
    .collection("users")
    .doc(uid)
    .collection("rateLimits")
    .doc(`${safeAction}_${dateKey}`);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = typeof snap.get("count") === "number" ? snap.get("count") as number : 0;
    if (current >= maxPerDay) {
      throw BadRequest("Daily request limit reached");
    }
    tx.set(ref, {
      action: safeAction,
      dateKey,
      count: FieldValue.increment(1),
      updatedAtMillis: Date.now(),
    }, { merge: true });
  });
}

function dateKeyFor(value: number): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
