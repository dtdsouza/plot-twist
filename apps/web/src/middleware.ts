import { NextRequest, NextResponse } from 'next/server';

const AUTH_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

const PROTECTED_ROUTE_PREFIXES = [
  '/',
  '/profile',
  '/account',
  '/clubs',
  '/bookshelf',
  '/discover',
  '/notifications',
];

const PUBLIC_ROUTE_PREFIXES = [
  '/verify-email-change',
];

function isProtected(pathname: string): boolean {
  if (PUBLIC_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return false;
  }
  if (AUTH_ROUTES.includes(pathname)) {
    return false;
  }
  return PROTECTED_ROUTE_PREFIXES.some(
    (p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/'))
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;

  if (token && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (!token && isProtected(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
