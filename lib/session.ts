import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./auth";

/**
 * Reads the current logged-in user. Used by server components and API routes.
 *
 * Middleware already gates access — by the time this runs, the cookie is
 * present and valid. We re-verify here as a defence-in-depth check (cheap)
 * and to surface the user's claims for the page/route to consume.
 *
 * Falls back to headers set by middleware so cached server components
 * stay consistent with the request.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await verifySession(token);
    if (user) return user;
  }
  // Fallback: middleware passes verified identity via headers for the
  // current request, in case the cookie is unreadable from this context.
  const h = headers();
  const email = h.get("x-user-email");
  if (email) {
    return {
      userId: h.get("x-user-id") ?? "",
      email,
      name: h.get("x-user-name") ?? email,
      role: h.get("x-user-role") ?? "",
      systemsAccess: (h.get("x-user-systems") ?? "").split(",").filter(Boolean),
    };
  }
  return null;
}
