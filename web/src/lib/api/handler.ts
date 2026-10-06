import { NextRequest, NextResponse } from "next/server";
import { ApiEnvelope, ApiError, fail } from "./response";
import { logServerError } from "@/lib/logging";
import { withFirebaseRequestConcurrency } from "@/lib/services/distributed-concurrency";
import { isFirestoreQuotaError } from "@/lib/firestore/quota";

type RouteHandler<T> = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<NextResponse<ApiEnvelope<T>>>;

/**
 * Wraps a route handler to centralize error handling, replacing the Spring
 * `GlobalExceptionHandler`. Any thrown `ApiError` becomes a structured JSON
 * response; unexpected errors become a 500.
 */
export function withErrorHandling<T>(handler: RouteHandler<T>): RouteHandler<T> {
  return async (req, ctx) => {
    try {
      // Keep the global Firebase gate for mutations, where transactions and
      // writes can genuinely overload the shared database. Applying it to
      // every GET added two Redis round trips (acquire + release) before a
      // learner could read even a small piece of progress data.
      //
      // Read endpoints are still protected by the edge rate limiter in
      // `proxy.ts`; they should not pay the additional semaphore cost.
      const execute = () => handler(req, ctx);
      const isReadOnly = ["GET", "HEAD", "OPTIONS"].includes(req.method);
      return req.nextUrl.pathname === "/api/health" || isReadOnly
        ? await execute()
        : await withFirebaseRequestConcurrency(execute);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.message, err.status, { headers: err.headers }) as NextResponse<ApiEnvelope<T>>;
      }
      logServerError("unhandled-route-error", err, {
        method: req.method,
        path: req.nextUrl.pathname,
      });
      if (isFirestoreQuotaError(err)) {
        return fail("Dữ liệu học tập đang tạm gián đoạn. Vui lòng thử lại sau; tiến độ đã lưu được giữ nguyên.", 503, {
          headers: { "Retry-After": "60" },
        }) as NextResponse<ApiEnvelope<T>>;
      }
      return fail("Internal server error", 500) as NextResponse<ApiEnvelope<T>>;
    }
  };
}
