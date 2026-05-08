/**
 * GET /sso?token=<launch-token>&return=<optional-path>
 *
 * Entry point for SSO from Crystal Core. Crystal Core mints a 60-second
 * one-shot JWT and redirects the browser here. We verify the token by
 * calling Crystal Core's /api/auth/verify, then mint our own session
 * cookie and bounce the user to the requested page (default: "/").
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  signSession,
  verifyWithCrystalCore,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const token = url.searchParams.get("token");
  const returnPath = url.searchParams.get("return") || "/";

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing token" },
      { status: 400 },
    );
  }

  const user = await verifyWithCrystalCore(token);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired SSO token" },
      { status: 401 },
    );
  }

  const sessionToken = await signSession(user);

  // Redirect to the requested path — only allow same-origin paths to
  // prevent open-redirect via the `return` param.
  const safeReturn = returnPath.startsWith("/") ? returnPath : "/";
  const dest = new URL(safeReturn, url.origin);
  const res = NextResponse.redirect(dest);

  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours, matches the JWT TTL
  });

  return res;
}
