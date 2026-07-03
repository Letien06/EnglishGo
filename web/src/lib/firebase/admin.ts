/**
 * Firebase Admin SDK singleton.
 *
 * Initialises once using FIREBASE_SERVICE_ACCOUNT_JSON (JSON string in env).
 * Hot-reload and serverless cold-starts are safe because we check
 * `getApps().length` before calling `initializeApp`.
 *
 * **Lazy initialisation** — the SDK is not initialised at import time so that
 * `next build` can collect page data without requiring the env var to be
 * present during the static-analysis / prerender phase.
 *
 * Exports:
 *  - `adminAuth`  — Firebase Auth (token verification)
 *  - `adminDb`    — Cloud Firestore
 */
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";
import { serverEnv } from "../env";

let _app: App | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _bucket: Bucket | undefined;

function getAdminApp(): App {
  if (!_app) {
    _app =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            credential: cert(
              JSON.parse(serverEnv.firebaseServiceAccountJson),
            ),
            storageBucket:
              serverEnv.firebaseStorageBucket ||
              `${serverEnv.firebaseProjectId}.appspot.com`,
          });
  }
  return _app;
}

/** Firebase Auth instance (lazy). */
export function getAdminAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getAdminApp());
  }
  return _auth;
}

/** Cloud Firestore instance (lazy). */
export function getAdminDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getAdminApp());
  }
  return _db;
}

export function getAdminStorageBucket(): Bucket {
  if (!_bucket) {
    _bucket = getStorage(getAdminApp()).bucket();
  }
  return _bucket;
}

/**
 * Convenience aliases that match the old eager-export names so existing
 * call-sites keep working. These are ES getters — the SDK is only
 * initialised on first property access, not at import time.
 */
export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    return Reflect.get(getAdminAuth(), prop);
  },
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_, prop) {
    return Reflect.get(getAdminDb(), prop);
  },
});

export const adminStorageBucket: Bucket = new Proxy({} as Bucket, {
  get(_, prop) {
    return Reflect.get(getAdminStorageBucket(), prop);
  },
});
