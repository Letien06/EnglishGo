import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  enforceEdgeRateLimit,
  rateLimitHeaders,
  type EdgeRateLimitPolicy,
} from "@/lib/edge-rate-limit";

const ONE_MINUTE_MS = 60_000;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let headers: Record<string, string> = {};

  if (pathname.startsWith("/api/")) {
    const rateLimit = await limitApiRequest(request);
    if (rateLimit.response) return rateLimit.response;
    headers = rateLimit.headers;
  }

  if (["/", "/login"].includes(pathname)) {
    return nextWithHeaders(headers);
  }

  const protectedPrefixes = [
    "/vocab",
    "/listen",
    "/read",
    "/practice",
    "/account",
    "/ai",
    "/admin",
  ];

  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedRoute && !request.cookies.has("session")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    applyHeaders(response, headers);
    return response;
  }

  return nextWithHeaders(headers);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};

async function limitApiRequest(request: NextRequest): Promise<{
  headers: Record<string, string>;
  response?: NextResponse;
}> {
  try {
    const policy = rateLimitPolicy(request);
    const result = await enforceEdgeRateLimit(policy);
    if (!result.enabled && rateLimitMustFailClosed()) {
      return { headers: {}, response: capacityGuardUnavailable() };
    }
    const headers = rateLimitHeaders(result);
    if (!result.allowed) {
      return {
        headers,
        response: NextResponse.json(
          { success: false, data: null, error: "Too many requests. Please retry shortly." },
          {
            status: 429,
            headers: {
              ...headers,
              "Retry-After": String(result.retryAfterSeconds),
            },
          },
        ),
      };
    }
    return { headers };
  } catch (error) {
    console.error("edge-rate-limit-unavailable", {
      path: request.nextUrl.pathname,
      message: error instanceof Error ? error.message : "unknown",
    });
    return rateLimitMustFailClosed()
      ? { headers: {}, response: capacityGuardUnavailable() }
      : { headers: {} };
  }
}

function rateLimitPolicy(request: NextRequest): EdgeRateLimitPolicy {
  const { pathname } = request.nextUrl;
  const authenticated = request.cookies.has("session") || request.headers.has("authorization");
  let group: string;
  let limit: number;

  if (pathname === "/api/health") {
    group = "health";
    limit = envLimit("RATE_LIMIT_HEALTH_PER_MIN", 120);
  } else if (isAiOrExternalRoute(pathname)) {
    group = "ai-external";
    limit = envLimit("RATE_LIMIT_AI_PER_MIN", 20);
  } else if (pathname === "/api/dautoeic/vocab/catalog") {
    group = "public-catalog";
    limit = envLimit("RATE_LIMIT_CATALOG_PER_MIN", 600);
  } else if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    group = authenticated ? "authenticated-read" : "public-read";
    limit = envLimit(
      authenticated ? "RATE_LIMIT_AUTH_READ_PER_MIN" : "RATE_LIMIT_PUBLIC_READ_PER_MIN",
      authenticated ? 1_200 : 600,
    );
  } else {
    group = "write";
    limit = envLimit("RATE_LIMIT_WRITE_PER_MIN", 120);
  }

  return {
    key: `rate-limit:${group}:${clientIdentity(request)}`,
    limit,
    windowMs: ONE_MINUTE_MS,
  };
}

function isAiOrExternalRoute(pathname: string): boolean {
  return pathname.startsWith("/api/ai/") ||
    pathname === "/api/vocab/dictionary" ||
    pathname.includes("/ai-words/preview") ||
    pathname === "/api/admin/generate";
}

function clientIdentity(request: NextRequest): string {
  // x-vercel-forwarded-for is set by Vercel at the trust boundary. Do not use
  // a client-provided header to impersonate many IPs in production.
  const forwarded = request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  return `ip-${fnv1a(ip).toString(36)}`;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function rateLimitMustFailClosed(): boolean {
  return process.env.RATE_LIMIT_FAIL_CLOSED?.trim().toLowerCase() === "true";
}

function capacityGuardUnavailable(): NextResponse {
  return NextResponse.json(
    { success: false, data: null, error: "Request capacity guard is unavailable" },
    { status: 503, headers: { "Retry-After": "1" } },
  );
}

function nextWithHeaders(headers: Record<string, string>): NextResponse {
  const response = NextResponse.next();
  applyHeaders(response, headers);
  return response;
}

function applyHeaders(response: NextResponse, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
}
