import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that do not need authentication
  if (['/', '/login', '/api/health'].includes(pathname)) {
    return NextResponse.next();
  }

  // Define protected route prefixes
  const protectedPrefixes = [
    '/vocab',
    '/listen',
    '/read',
    '/practice',
    '/account',
    '/ai',
    '/admin'
  ];

  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtectedRoute) {
    const hasSessionCookie = request.cookies.has('session');
    
    // Redirect unauthenticated users to the login page
    if (!hasSessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/health (health check endpoint)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\..*).*)',
  ],
};
