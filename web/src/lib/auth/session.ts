/**
 * Server-side auth helpers.
 *
 * Ported from:
 *  - `security/FirebaseAuthenticationFilter.java`  (extract token)
 *  - `service/FirebaseAuthenticationService.java`   (verify + provision)
 *  - `security/AppUserPrincipal.java`               (user shape)
 *
 * IMPORTANT: These helpers use Firebase Admin SDK and must only be called
 * from server components or route handlers — never from middleware (Edge).
 */
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../firebase/admin";
import { serverEnv } from "../env";
import { Unauthorized, Forbidden } from "../api/response";
import type { AppUser } from "../../types";

const USERS_COLLECTION = "users";
const USER_PROFILE_CACHE_TAG = "current-user-profile";
const USER_PROFILE_CACHE_SECONDS = 60;
const SESSION_REVOCATION_CACHE_SECONDS = 60;

const cachedStoredUser = unstable_cache(
  async (uid: string): Promise<AppUser | null> => {
    const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
    if (!snap.exists) return null;
    return toAppUser(uid, snap.data() ?? {});
  },
  ["current-user-profile"],
  {
    revalidate: USER_PROFILE_CACHE_SECONDS,
    tags: [USER_PROFILE_CACHE_TAG],
  },
);

/**
 * A read request does not need to contact Firebase Auth again when the same
 * session was already revocation-checked in the last minute. Writes and role
 * checks continue to use Firebase's immediate check below.
 */
const cachedSessionRevocationStatus = unstable_cache(
  async (uid: string, authTimeSeconds: number): Promise<boolean> => {
    const userRecord = await adminAuth.getUser(uid);
    if (userRecord.disabled) return false;
    const validAfterMillis = Date.parse(userRecord.tokensValidAfterTime ?? "");
    const validAfterSeconds = Number.isFinite(validAfterMillis)
      ? Math.floor(validAfterMillis / 1000)
      : 0;
    return authTimeSeconds >= validAfterSeconds;
  },
  ["session-revocation-status"],
  { revalidate: SESSION_REVOCATION_CACHE_SECONDS },
);

/* ------------------------------------------------------------------ */
/*  Token verification                                                 */
/* ------------------------------------------------------------------ */

/**
 * Verify a Firebase ID token and return the decoded claims.
 * Throws `Unauthorized` on invalid / expired tokens.
 */
export async function verifyIdToken(token: string) {
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    throw Unauthorized("Invalid or expired Firebase ID token");
  }
}

/**
 * Verify a Firebase session cookie and return the decoded claims.
 * Used by `getCurrentUser` when reading from the `session` cookie.
 */
export async function verifySessionCookie(cookie: string) {
  try {
    return await adminAuth.verifySessionCookie(cookie, true);
  } catch {
    return null; // expired or invalid session cookie → treat as unauthenticated
  }
}

/* ------------------------------------------------------------------ */
/*  User provisioning (find-or-create)                                 */
/* ------------------------------------------------------------------ */

/**
 * Given decoded Firebase token claims, find-or-create the user document
 * in Firestore (`users/{uid}`). Merges latest profile data on each call.
 *
 * Exported so the session POST route can call it directly after
 * `createSessionCookie`.
 */
export async function provisionUser(decoded: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<AppUser> {
  const uid = decoded.uid;
  const email = decoded.email || `${uid}@firebase.local`;
  const displayName = decoded.name || email;
  const providerAvatarUrl = decoded.picture || null;

  const userRef = adminDb.collection(USERS_COLLECTION).doc(uid);
  const snap = await userRef.get();
  const adminEmails = serverEnv.adminEmails;

  if (!snap.exists) {
    const role = adminEmails.includes(email.toLowerCase()) ? "ADMIN" : "STUDENT";
    const now = Date.now();
    const todayDateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
    const newUser: Record<string, unknown> = {
      uid,
      firebaseUid: uid,
      email,
      displayName,
      avatarUrl: providerAvatarUrl,
      avatarSource: providerAvatarUrl ? "provider" : "none",
      role,
      level: null,
      targetScore: null,
      studyStreakDays: 0,
      studyStudiedToday: false,
      studyTodayActivityCount: 0,
      studyTodayModules: [],
      studyTodayModuleCounts: { listening: 0, reading: 0, practice: 0, vocab: 0 },
      studyTodayXp: 0,
      studyTodayDateKey: todayDateKey,
      studyStreakUpdatedAtMillis: now,
      totalStudyXp: 0,
      studyModuleTotals: { listening: 0, reading: 0, practice: 0, vocab: 0 },
      practiceCompletedTests: 0,
      practiceScoreTotal: 0,
      practiceAverageScore: 0,
      practiceBestScore: 0,
      vocabMasteredWords: 0,
      vocabDueWords: 0,
      vocabNextDueAtMillis: null,
      vocabSummaryUpdatedAtMillis: now,
      createdAtMillis: now,
      updatedAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await userRef.set(newUser);

    const user = {
      uid,
      firebaseUid: uid,
      email,
      displayName,
      avatarUrl: providerAvatarUrl,
      role,
      level: null,
      targetScore: null,
      createdAtMillis: now,
      updatedAtMillis: now,
    } as AppUser;
    invalidateCurrentUserProfileCache();
    return user;
  }

  // Existing user — merge latest profile info
  const data = snap.data()!;
  const existingRole = (data.role as string) || "STUDENT";
  const role = adminEmails.includes(email.toLowerCase()) ? "ADMIN" : existingRole;
  const existingAvatarUrl = typeof data.avatarUrl === "string" && data.avatarUrl.trim()
    ? data.avatarUrl
    : null;
  const existingAvatarSource = typeof data.avatarSource === "string" ? data.avatarSource : null;
  const avatarLockedByUser = existingAvatarSource === "custom" || existingAvatarSource === "none";
  const nextAvatarUrl = avatarLockedByUser ? existingAvatarUrl : providerAvatarUrl ?? existingAvatarUrl;
  const nextAvatarSource = avatarLockedByUser
    ? existingAvatarSource
    : providerAvatarUrl
      ? "provider"
      : existingAvatarSource ?? "none";

  // Only write back to Firestore when something actually changed. Provisioning
  // used to run an `update()` on EVERY page load / navigation, which added a
  // Firestore round-trip (and cost) to every server render and made tab
  // switching feel slow. Skipping the no-op write removes that latency.
  const profileChanged =
    data.email !== email ||
    data.displayName !== displayName ||
    (data.avatarUrl ?? null) !== nextAvatarUrl ||
    (data.avatarSource ?? null) !== nextAvatarSource ||
    data.role !== role;

  if (profileChanged) {
    await userRef.update({
      email,
      displayName,
      avatarUrl: nextAvatarUrl,
      avatarSource: nextAvatarSource,
      role,
      updatedAtMillis: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const user = {
    uid,
    firebaseUid: uid,
    email,
    displayName,
    avatarUrl: nextAvatarUrl,
    role,
    level: (data.level as string) ?? null,
    targetScore: (data.targetScore as number) ?? null,
    createdAtMillis: (data.createdAtMillis as number) ?? null,
    updatedAtMillis: (data.updatedAtMillis as number) ?? null,
  } as AppUser;
  if (profileChanged) invalidateCurrentUserProfileCache();
  return user;
}

async function verifySessionCookieForRead(cookie: string) {
  try {
    // Signature and expiry are still verified for every request. Only the
    // remote revocation lookup is reused briefly for read-only navigation.
    const decoded = await adminAuth.verifySessionCookie(cookie, false);
    const authTime = typeof decoded.auth_time === "number" ? decoded.auth_time : 0;
    return await cachedSessionRevocationStatus(decoded.uid, authTime) ? decoded : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Current user (verify + provision)                                  */
/* ------------------------------------------------------------------ */

/**
 * Read the session from the `session` cookie (Firebase session cookie)
 * or the `Authorization: Bearer <idToken>` header, verify it, then
 * find-or-create the user document in Firestore.
 *
 * Returns `null` when no token is present (anonymous visitor).
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  return getCurrentUserFromRequest(verifySessionCookie);
});

/**
 * For read-only pages and GET routes. The session signature is always checked,
 * while Firebase's revocation state is cached for at most one minute.
 */
export const getCurrentUserForRead = cache(async (): Promise<AppUser | null> => {
  return getCurrentUserFromRequest(verifySessionCookieForRead);
});

async function getCurrentUserFromRequest(
  sessionVerifier: (cookie: string) => Promise<Awaited<ReturnType<typeof verifySessionCookie>>>,
): Promise<AppUser | null> {
  /* --- 1. Try session cookie ------------------------------------------- */
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (sessionCookie?.value) {
    const decoded = await sessionVerifier(sessionCookie.value);
    if (decoded) {
      return getStoredOrProvisionedUser(decoded);
    }
    // Invalid/expired session cookie → fall through
  }

  /* --- 2. Try Authorization header (API clients / mobile) -------------- */
  const hdrs = await headers();
  const authHeader = hdrs.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return getStoredOrProvisionedUser(decoded);
    } catch {
      return null;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Guard helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Like `getCurrentUser()` but throws `Unauthorized` when there is no
 * valid session. Use in route handlers that require authentication.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw Unauthorized();
  return user;
}

/**
 * Requires the current user to have (at least) the given role.
 * Throws `Unauthorized` if not logged in, `Forbidden` if role mismatch.
 */
export async function requireRole(
  ...allowed: AppUser["role"][]
): Promise<AppUser> {
  const authenticatedUser = await requireUser();
  // Profile reads are cached briefly for normal navigation, but authorization
  // decisions must observe role changes immediately (for example, after an
  // admin account is revoked).
  const user = await getFreshStoredUser(authenticatedUser.uid);
  if (!user) throw Unauthorized();
  if (!allowed.includes(user.role)) {
    throw Forbidden(
      `Role "${user.role}" is not allowed. Required: ${allowed.join(" | ")}`,
    );
  }
  return user;
}

/** Same contract as requireUser(), optimized only for read-only rendering. */
export async function requireUserForRead(): Promise<AppUser> {
  const user = await getCurrentUserForRead();
  if (!user) throw Unauthorized();
  return user;
}

/**
 * Cached profile data is sufficient for normal page rendering. New accounts
 * still take the provisioning path, while existing accounts avoid a Firestore
 * profile read on each page/API request for a short period.
 */
async function getStoredOrProvisionedUser(decoded: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<AppUser> {
  return await cachedStoredUser(decoded.uid) ?? provisionUser(decoded);
}

async function getFreshStoredUser(uid: string): Promise<AppUser | null> {
  const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  return toAppUser(uid, snap.data() ?? {});
}

export function invalidateCurrentUserProfileCache(): void {
  revalidateTag(USER_PROFILE_CACHE_TAG, { expire: 0 });
}

function toAppUser(uid: string, data: Record<string, unknown>): AppUser {
  return {
    uid,
    firebaseUid: typeof data.firebaseUid === "string" ? data.firebaseUid : uid,
    email: typeof data.email === "string" ? data.email : `${uid}@firebase.local`,
    displayName: typeof data.displayName === "string"
      ? data.displayName
      : typeof data.email === "string"
        ? data.email
        : uid,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    role: data.role === "ADMIN" || data.role === "TEACHER" || data.role === "STUDENT"
      ? data.role
      : "STUDENT",
    level: typeof data.level === "string" ? data.level : null,
    targetScore: typeof data.targetScore === "number" ? data.targetScore : null,
    createdAtMillis: typeof data.createdAtMillis === "number" ? data.createdAtMillis : null,
    updatedAtMillis: typeof data.updatedAtMillis === "number" ? data.updatedAtMillis : null,
  };
}
