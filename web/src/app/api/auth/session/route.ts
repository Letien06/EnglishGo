import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { getCurrentUser, provisionUser } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 5; // 5 days

/**
 * POST /api/auth/session
 * Accept { idToken } from Firebase client SDK, verify it,
 * create a session cookie, and provision user in Firestore.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json();
  const idToken = body?.idToken;

  if (!idToken || typeof idToken !== "string") {
    return fail("Missing idToken", 400);
  }

  // Verify the ID token
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  if (!decodedToken) {
    return fail("Invalid token", 401);
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
 * Clear the session cookie (logout).
 */
export const DELETE = withErrorHandling(async () => {
  const cookieStore = await cookies();
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
  const user = await getCurrentUser();
  if (!user) {
    return ok(null);
  }
  return ok({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
});
