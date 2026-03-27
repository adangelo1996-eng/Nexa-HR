import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "nexa_hr_token";

function centralHubOrigin(): string {
  const raw =
    process.env.CENTRAL_HUB_ORIGIN?.trim() || process.env.NEXT_PUBLIC_CENTRAL_HUB_ORIGIN?.trim() || "";
  return raw.replace(/\/$/, "");
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE)?.value);
  const isLoginPage = pathname.startsWith("/login");
  const isSsoPage = pathname.startsWith("/auth/sso");
  const isHealthCheck = pathname === "/health";

  if (!hasSession && isLoginPage) {
    const hub = centralHubOrigin();
    if (hub && !request.nextUrl.searchParams.has("local")) {
      const handoff = new URL("/api/auth/handoff", hub);
      handoff.searchParams.set("app", "nexa");
      handoff.searchParams.set("next", "/");
      return NextResponse.redirect(handoff);
    }
  }

  if (!hasSession && !isLoginPage && !isSsoPage && !isHealthCheck) {
    const hub = centralHubOrigin();
    if (hub) {
      try {
        const dest = pathname + (request.nextUrl.search ?? "");
        const safeDest = dest.startsWith("/") ? dest : `/${dest}`;
        const handoff = new URL("/api/auth/handoff", hub);
        handoff.searchParams.set("app", "nexa");
        handoff.searchParams.set("next", safeDest);
        return NextResponse.redirect(handoff);
      } catch {
        // fallback to login
      }
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Non reindirizzare /auth/sso: serve per aggiornare la sessione dopo un nuovo handoff dall'hub.
  if (hasSession && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
