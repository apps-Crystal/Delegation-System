import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "delegation_session";

/**
 * Routes that don't require a session.
 *  - /sso receives the launch token from Crystal Core
 *  - /api/health is the diagnostics ping
 *  - Static assets and Next internals
 */
const PUBLIC_PREFIXES = ["/sso", "/api/health", "/_next", "/favicon"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

function getSecret(): Uint8Array | null {
  const raw = process.env.DELEGATION_JWT_SECRET;
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

function launchUrl(): string {
  const coreUrl = process.env.CRYSTAL_CORE_URL?.replace(/\/+$/, "") ?? "";
  return `${coreUrl}/api/sso/launch?system=delegation`;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSecret();
  let payload: Record<string, unknown> | null = null;

  if (token && secret) {
    try {
      const result = await jwtVerify(token, secret);
      payload = result.payload as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    // For API calls, return 401 instead of redirecting — clients should
    // refresh the page to bounce through Crystal Core.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated", code: "NO_SESSION" },
        { status: 401 },
      );
    }
    const target = launchUrl();
    if (!target.startsWith("http")) {
      return NextResponse.json(
        { ok: false, error: "CRYSTAL_CORE_URL is not configured" },
        { status: 503 },
      );
    }
    const u = new URL(target);
    u.searchParams.set("return", pathname + search);
    return NextResponse.redirect(u);
  }

  // Forward verified identity to downstream handlers via request headers.
  const headers = new Headers(req.headers);
  headers.set("x-user-id", String(payload.userId ?? payload.sub ?? ""));
  headers.set("x-user-email", String(payload.email ?? ""));
  headers.set("x-user-name", String(payload.name ?? ""));
  headers.set("x-user-role", String(payload.role ?? ""));
  headers.set(
    "x-user-systems",
    Array.isArray(payload.systemsAccess) ? (payload.systemsAccess as string[]).join(",") : "",
  );

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Run on everything except static assets handled implicitly.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
