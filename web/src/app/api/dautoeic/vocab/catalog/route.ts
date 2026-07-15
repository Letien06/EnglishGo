import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";

const PUBLIC_CACHE_HEADERS = {
  // Browser cache is deliberately short; Vercel's CDN is authoritative for
  // the longer shared cache and serves stale content while it revalidates.
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  "Vary": "Cookie, Authorization",
};

export const GET = withErrorHandling(async (req) => {
  const user = await getCurrentUser();
  const catalog = await dautoeicVocab.getVocabularyCatalogView(user?.uid);
  // Progress fields are personalized for a session. Only completely anonymous
  // calls can enter a shared CDN cache; Vary also prevents a cache key collision
  // if an intermediary sees an authenticated request.
  const isPersonalized = Boolean(user) || req.cookies.has("session") || req.headers.has("authorization");
  return ok(catalog, {
    headers: isPersonalized
      ? { "Cache-Control": "private, no-store", "Vary": "Cookie, Authorization" }
      : PUBLIC_CACHE_HEADERS,
  });
});
