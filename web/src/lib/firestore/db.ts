/**
 * Re-export Firestore instance from Firebase Admin singleton.
 * Other modules should import `adminDb` from here (not from firebase/admin
 * directly) so the data layer stays decoupled from auth concerns.
 */
export { adminDb } from "../firebase/admin";
