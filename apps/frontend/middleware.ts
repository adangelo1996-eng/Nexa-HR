import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "nexa_hr_token";
const REFRESH_COOKIE = "nexa_hr_refresh";

function hasAuthSession(request: NextRequest): boolean {
  return (
    Boolean(request.cookies.get(AUTH_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value)
  );
}

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/welcome")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/auth/sso")) return true;
  if (pathname === "/health") return true;
  return false;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = hasAuthSession(request);
  const isLoginPage = pathname.startsWith("/login");
  const isHealthCheck = pathname === "/health";

  if (!hasSession && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!hasSession && isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession && !isPublicPath(pathname) && !isHealthCheck) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && (isLoginPage || pathname.startsWith("/welcome"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
