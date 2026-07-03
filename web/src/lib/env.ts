/**
 * Centralized environment access. Mirrors the variables defined in the
 * Spring Boot `application-prod.yml` and `docs/deployment.md`.
 *
 * Server-only variables are read lazily so that client bundles never include
 * secrets. Only NEXT_PUBLIC_* values are safe to expose to the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const serverEnv = {
  // Firebase Admin (server-side token verification + Firestore).
  get firebaseServiceAccountJson() {
    return required("FIREBASE_SERVICE_ACCOUNT_JSON");
  },
  get firebaseProjectId() {
    return required("FIREBASE_PROJECT_ID");
  },
  // Gemini AI.
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get geminiModel() {
    return optional("GEMINI_MODEL", "gemini-2.5-flash");
  },
  // Media storage base URL.
  get mediaBaseUrl() {
    return optional("MEDIA_BASE_URL");
  },
  get firebaseStorageBucket() {
    return optional("FIREBASE_STORAGE_BUCKET");
  },
  // Comma-separated list of emails that are automatically assigned ADMIN role.
  get adminEmails(): string[] {
    const raw = optional("ADMIN_EMAILS");
    if (!raw) return [];
    return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  },
  // DauToeic external Supabase API.
  get dauToeicSupabaseUrl() {
    return optional(
      "DAUTOEIC_SUPABASE_URL",
      "https://qfhmnlvgweznzcsoijyr.supabase.co",
    );
  },
  get dauToeicAnonKey() {
    return optional("DAUTOEIC_ANON_KEY");
  },
  get dauToeicMediaBaseUrl() {
    return optional(
      "DAUTOEIC_MEDIA_BASE_URL",
      "https://qfhmnlvgweznzcsoijyr.supabase.co/storage/v1/object/public/mock-test-media",
    );
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** Public config, safe to expose to the browser (Firebase web SDK). */
export const publicEnv = {
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_WEB_API_KEY ?? "",
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
} as const;
