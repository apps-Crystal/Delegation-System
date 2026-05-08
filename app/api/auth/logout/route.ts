import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Clear the local session cookie and bounce to Crystal Core's logout
 * so the user is signed out everywhere, not just here.
 */
export async function GET(req: NextRequest) {
  const coreUrl = process.env.CRYSTAL_CORE_URL?.replace(/\/+$/, "") ?? "";
  const dest = coreUrl ? `${coreUrl}/api/auth/logout` : new URL("/sso", req.nextUrl.origin).toString();
  const res = NextResponse.redirect(dest);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export const POST = GET;
