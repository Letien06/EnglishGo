import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import { invalidateCurrentUserProfileCache } from "@/lib/auth/session";
import type { AppUser } from "@/types";

const MAX_AVATAR_DATA_URL_LENGTH = 240_000;
const MAX_REMOTE_AVATAR_URL_LENGTH = 2_048;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/]+=*$/i;

export interface AccountSettingsView {
  email: string;
  role: string;
  form: {
    displayName: string;
    avatarUrl: string | null;
  };
}

export function getSettings(user: AppUser): AccountSettingsView {
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
  const avatarUrl = normalizeAvatarUrl(form.avatarUrl);

  await adminDb.collection("users").doc(uid).set(
    {
      displayName,
      avatarUrl,
      avatarSource: avatarUrl ? "custom" : "none",
      updatedAtMillis: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  invalidateCurrentUserProfileCache();
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

function normalizeAvatarUrl(value: string | null | undefined): string | null {
  const avatarUrl = value?.trim() || null;
  if (!avatarUrl) return null;

  if (avatarUrl.startsWith("data:image/")) {
    if (avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH || !AVATAR_DATA_URL_PATTERN.test(avatarUrl)) {
      throw BadRequest("Avatar image is too large or invalid");
    }
    return avatarUrl;
  }

  if (avatarUrl.length > MAX_REMOTE_AVATAR_URL_LENGTH) {
    throw BadRequest("Avatar URL is too long");
  }
  let parsed: URL;
  try {
    parsed = new URL(avatarUrl);
  } catch {
    throw BadRequest("Avatar URL is invalid");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw BadRequest("Avatar URL must be http or https");
  }
  return avatarUrl;
}
