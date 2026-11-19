import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { getCurrentUserForRead, provisionUser, verifySessionCookie } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 5; // 5 days

/**
 * POST /api/auth/session
 * Accept { idToken } from Firebase client SDK, verify it,
 * create a session cookie, and provision user in Firestore.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  let body: { idToken?: unknown } | null = null;
  try {
    body = (await req.json()) as { idToken?: unknown };
  } catch {
    return fail("Invalid JSON payload", 400);
  }
  const idToken = body?.idToken;

  if (!idToken || typeof idToken !== "string") {
    return fail("Missing idToken", 400);
  }

  // Verify the ID token with revocation check
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return fail("Invalid or revoked token", 401);
  }

  // Create a session cookie using Firebase Admin
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE * 1000, // milliseconds
  });

  // Set the cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // Provision the user in Firestore
  const user = await provisionUser(decodedToken);

  return ok({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  });
});

/**
 * DELETE /api/auth/session
 * Revoke Firebase refresh tokens (invalidating stolen cookies) and clear cookie.
 */
export const DELETE = withErrorHandling(async () => {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) {
    const decoded = await verifySessionCookie(existing);
    if (decoded?.uid) {
      await adminAuth.revokeRefreshTokens(decoded.uid).catch(() => undefined);
    }
  }
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return ok({ loggedOut: true });
});

/**
 * GET /api/auth/session
 * Check if user is authenticated. Returns user info or null.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUserForRead();
  if (!user) {
    return ok(null);
  }
  return ok({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  });
});
