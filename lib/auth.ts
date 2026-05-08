import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "delegation_session";
const SESSION_TTL = "8h";

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  systemsAccess: string[];
}

function getSecret(): Uint8Array {
  const raw = process.env.DELEGATION_JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("DELEGATION_JWT_SECRET must be set and at least 32 chars long");
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(user: SessionUser): Promise<string> {
  return await new SignJWT({
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    systemsAccess: user.systemsAccess,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(user.userId)
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: String(payload.userId ?? payload.sub ?? ""),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? ""),
      systemsAccess: Array.isArray(payload.systemsAccess)
        ? (payload.systemsAccess as string[])
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Calls Crystal Core's /api/auth/verify with the one-shot launch token.
 * Returns the verified user or null if Crystal Core rejects the token.
 */
export async function verifyWithCrystalCore(launchToken: string): Promise<SessionUser | null> {
  const coreUrl = process.env.CRYSTAL_CORE_URL?.replace(/\/+$/, "");
  if (!coreUrl) throw new Error("CRYSTAL_CORE_URL is not set");

  const res = await fetch(`${coreUrl}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: launchToken, system: "delegation" }),
    cache: "no-store",
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.ok || !json?.data?.allowed) return null;

  const d = json.data;
  return {
    userId: d.user.userId,
    email: d.user.email,
    name: d.user.name,
    role: d.role,
    systemsAccess: d.systemsAccess ?? [],
  };
}

/** Crystal Core's launch URL — where unauthenticated users get sent. */
export function crystalCoreLaunchUrl(): string {
  const coreUrl = process.env.CRYSTAL_CORE_URL?.replace(/\/+$/, "");
  if (!coreUrl) throw new Error("CRYSTAL_CORE_URL is not set");
  return `${coreUrl}/api/sso/launch?system=delegation`;
}
