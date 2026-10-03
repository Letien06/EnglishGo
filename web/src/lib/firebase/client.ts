/**
 * Firebase Web SDK (client-side) singleton.
 *
 * Uses NEXT_PUBLIC_* environment variables that are embedded at build time.
 * Only imported in client components / browser code.
 *
 * **Lazy initialisation** — prevents SSR prerender failures when the env
 * vars are not present at `next build` time (they are only available at
 * runtime or when deployed on Vercel).
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_WEB_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

import { getFirestore, type Firestore } from "firebase/firestore";

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;

export function getClientApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return _app;
}

export function getClientAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getClientApp());
  }
  return _auth;
}

export function getClientDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getClientApp());
  }
  return _db;
}

/**
 * Backward-compatible named export.
 * Since login page accesses `clientAuth` at the top of a React component
 * (inside event handlers, not at module level), we can use a getter that
 * defers initialization until first call.
 */
export { getClientAuth as clientAuth_fn };

