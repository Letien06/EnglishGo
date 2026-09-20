import { NextResponse } from "next/server";

/**
 * Standard API envelope, ported from the Spring Boot `ApiResponse<T>` DTO.
 * Keeps the same shape used by the existing frontend JS clients:
 *   { success: boolean, data: T | null, error: string | null }
 */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json<ApiEnvelope<T>>(
    { success: true, data, error: null },
    init,
  );
}

export function fail(
  message: string,
  status = 400,
  init?: ResponseInit,
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json<ApiEnvelope<null>>(
    { success: false, data: null, error: message },
    { ...init, status },
  );
}

/**
 * Thrown by service/route code to produce a structured error response.
 * Mirrors Spring's ResponseStatusException usage across the controllers.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly headers?: HeadersInit;

  constructor(message: string, status = 400, headers?: HeadersInit) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.headers = headers;
  }
}

export const Unauthorized = (msg = "Unauthorized") => new ApiError(msg, 401);
export const Forbidden = (msg = "Forbidden") => new ApiError(msg, 403);
export const NotFound = (msg = "Not found") => new ApiError(msg, 404);
export const BadRequest = (msg = "Bad request") => new ApiError(msg, 400);
export const TooManyRequests = (
  msg = "Too many requests",
  retryAfterSeconds = 1,
  limit?: number,
) => new ApiError(msg, 429, {
  "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
  ...(limit ? {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": "0",
    "RateLimit-Reset": String(Math.max(1, Math.ceil(retryAfterSeconds))),
  } : {}),
});
