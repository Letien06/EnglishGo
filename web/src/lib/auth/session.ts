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
import { cookies, headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../firebase/admin";
import { serverEnv } from "../env";
import { Unauthorized, Forbidden } from "../api/response";
import type { AppUser } from "../../types";

const USERS_COLLECTION = "users";

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
  const avatarUrl = decoded.picture || null;

  const userRef = adminDb.collection(USERS_COLLECTION).doc(uid);
  const snap = await userRef.get();
  const adminEmails = serverEnv.adminEmails;

  if (!snap.exists) {
    const role = adminEmails.includes(email.toLowerCase()) ? "ADMIN" : "STUDENT";
    const now = Date.now();
    const newUser: Record<string, unknown> = {
      uid,
      firebaseUid: uid,
      email,
      displayName,
      avatarUrl,
      role,
      level: null,
      targetScore: null,
      createdAtMillis: now,
      updatedAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await userRef.set(newUser);

    return {
      uid,
      firebaseUid: uid,
      email,
      displayName,
      avatarUrl,
      role,
      level: null,
      targetScore: null,
      createdAtMillis: now,
      updatedAtMillis: now,
    } as AppUser;
  }

  // Existing user — merge latest profile info
  const data = snap.data()!;
  const existingRole = (data.role as string) || "STUDENT";
  const role = adminEmails.includes(email.toLowerCase()) ? "ADMIN" : existingRole;

  // Only write back to Firestore when something actually changed. Provisioning
  // used to run an `update()` on EVERY page load / navigation, which added a
  // Firestore round-trip (and cost) to every server render and made tab
  // switching feel slow. Skipping the no-op write removes that latency.
  const profileChanged =
    data.email !== email ||
    data.displayName !== displayName ||
    (data.avatarUrl ?? null) !== avatarUrl ||
    data.role !== role;

  if (profileChanged) {
    await userRef.update({
      email,
      displayName,
      avatarUrl,
      role,
      updatedAtMillis: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return {
    uid,
    firebaseUid: uid,
    email,
    displayName,
    avatarUrl,
    role,
    level: (data.level as string) ?? null,
    targetScore: (data.targetScore as number) ?? null,
    createdAtMillis: (data.createdAtMillis as number) ?? null,
    updatedAtMillis: (data.updatedAtMillis as number) ?? null,
  } as AppUser;
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
  /* --- 1. Try session cookie ------------------------------------------- */
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (sessionCookie?.value) {
    const decoded = await verifySessionCookie(sessionCookie.value);
    if (decoded) {
      return provisionUser(decoded);
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
      return provisionUser(decoded);
    } catch {
      return null;
    }
  }

  return null;
});

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
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    throw Forbidden(
      `Role "${user.role}" is not allowed. Required: ${allowed.join(" | ")}`,
    );
  }
  return user;
}
