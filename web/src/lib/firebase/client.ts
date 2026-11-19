/**
 * Backward-compatible Firebase Web SDK entrypoints.
 * Prefer importing from `./client-auth` or `./client-firestore` directly so
 * routes like `/login` do not pull the Firestore client SDK into their bundle.
 */
export { getClientApp } from "./client-app";
export { getClientAuth, getClientAuth as clientAuth_fn } from "./client-auth";
export { getClientDb } from "./client-firestore";
