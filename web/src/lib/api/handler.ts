import { NextRequest, NextResponse } from "next/server";
import { ApiEnvelope, ApiError, fail } from "./response";
import { logServerError } from "@/lib/logging";

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
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.message, err.status) as NextResponse<ApiEnvelope<T>>;
      }
      logServerError("unhandled-route-error", err, {
        method: req.method,
        path: req.nextUrl.pathname,
      });
      return fail("Internal server error", 500) as NextResponse<ApiEnvelope<T>>;
    }
  };
}
