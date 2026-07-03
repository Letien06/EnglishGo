/**
 * Application user, ported from `entity/User.java`.
 * Stored in Firestore collection `users` keyed by Firebase UID.
 *
 * Java `UserRole` enum has: STUDENT, TEACHER, ADMIN.
 */
export type AppUser = {
  uid: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  level: string | null;
  targetScore: number | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
};
