import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (["/", "/login", "/api/health"].includes(pathname)) {
    return NextResponse.next();
  }

  const protectedPrefixes = [
    "/vocab",
    "/listen",
    "/read",
    "/practice",
    "/account",
    "/ai",
    "/admin",
    "/continue",
  ];

  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedRoute && !request.cookies.has("session")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\..*).*)",
  ],
};
