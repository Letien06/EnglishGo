import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import type { AppUser } from "@/types";

export interface AccountSettingsView {
  email: string;
  role: string;
  form: {
    displayName: string;
    avatarUrl: string | null;
  };
}

export async function getSettings(uid: string): Promise<AccountSettingsView> {
  const user = await findUser(uid);
  return {
    email: user.email,
    role: user.role,
    form: {
      displayName: user.displayName || user.email,
      avatarUrl: user.avatarUrl,
    },
  };
}

export async function updateSettings(
  uid: string,
  form: { displayName?: string | null; avatarUrl?: string | null },
): Promise<AppUser> {
  const user = await findUser(uid);
  const displayName = form.displayName?.trim();
  if (!displayName) throw BadRequest("Display name is required");
  const avatarUrl = form.avatarUrl?.trim() || null;

  await adminDb.collection("users").doc(uid).set(
    {
      displayName,
      avatarUrl,
      updatedAtMillis: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ...user, displayName, avatarUrl, updatedAtMillis: Date.now() };
}

export async function changePassword(
  uid: string,
  form: { newPassword?: string | null },
): Promise<void> {
  await findUser(uid);
  const newPassword = form.newPassword?.trim();
  if (!newPassword || newPassword.length < 6) {
    throw BadRequest("New password must be at least 6 characters");
  }
  await adminAuth.updateUser(uid, { password: newPassword });
}

async function findUser(uid: string): Promise<AppUser> {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) throw Unauthorized("User not found");
  const data = snap.data() ?? {};
  return {
    uid,
    firebaseUid: stringValue(data.firebaseUid) ?? uid,
    email: stringValue(data.email) ?? `${uid}@firebase.local`,
    displayName: stringValue(data.displayName) ?? stringValue(data.email) ?? uid,
    avatarUrl: stringValue(data.avatarUrl),
    role: normalizeRole(stringValue(data.role)),
    level: stringValue(data.level),
    targetScore: numberValue(data.targetScore),
    createdAtMillis: numberValue(data.createdAtMillis),
    updatedAtMillis: numberValue(data.updatedAtMillis),
  };
}

function normalizeRole(value: string | null): AppUser["role"] {
  return value === "ADMIN" || value === "TEACHER" || value === "STUDENT"
    ? value
    : "STUDENT";
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
