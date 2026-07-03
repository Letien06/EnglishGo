import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";

/**
 * Lightweight health check used to verify the Vercel deployment is live.
 */
export const GET = withErrorHandling(async () =>
  ok({ status: "up", time: new Date().toISOString() }),
);
