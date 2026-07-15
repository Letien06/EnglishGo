import { NextRequest, NextResponse } from "next/server";
import { ApiEnvelope, ApiError, fail } from "./response";
import { logServerError } from "@/lib/logging";
import { withFirebaseRequestConcurrency } from "@/lib/services/distributed-concurrency";

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
      // Most API handlers authenticate or read/write Firestore. A single
      // serverless-wide gate keeps Firebase from being saturated during a
      // burst; /health is intentionally dependency-free and bypasses it.
      const execute = () => handler(req, ctx);
      return req.nextUrl.pathname === "/api/health"
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
      return fail("Internal server error", 500) as NextResponse<ApiEnvelope<T>>;
    }
  };
}
