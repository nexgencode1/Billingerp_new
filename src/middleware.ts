import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/jwt";
import { PORTAL_COOKIE, verifyPortalToken } from "@/lib/portal-jwt";

const PUBLIC_PATHS = ["/", "/login", "/api/auth/login", "/robots.txt"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Offline support files must load without a session (the service worker fetches them itself).
  if (pathname === "/sw.js" || pathname === "/offline.html" || pathname === "/manifest.webmanifest" || pathname === "/icon.svg") {
    return NextResponse.next();
  }

  // Customer portal: its own cookie and its own login page. Portal API calls are authorised by
  // the backend ([RequirePortalSession]); staff sessions never grant portal pages and vice versa.
  if (pathname.startsWith("/api/portal")) return NextResponse.next();
  if (pathname === "/portal/login") return NextResponse.next();
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    const portalToken = req.cookies.get(PORTAL_COOKIE)?.value;
    const portal = portalToken ? await verifyPortalToken(portalToken) : null;
    if (!portal) return NextResponse.redirect(new URL("/portal/login", req.url));
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
