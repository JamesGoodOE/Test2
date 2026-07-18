import { cookies } from "next/headers";
import type { Role, User } from "@/lib/domain/types";
import { getRepository } from "@/lib/db";
import { DEMO_TENANT_ID } from "@/lib/db/memory-repo";

const COOKIE = "registry_session";

export interface Session {
  user: User;
  tenantId: string;
}

const RANK: Record<Role, number> = { VIEWER: 0, CONTRIBUTOR: 1, ADMIN: 2 };

export function hasRole(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * Current session, or null. In AUTH_MODE=local the cookie holds a user id that
 * is validated against the repository. AUTH_MODE=workos (Entra ID/Google SSO)
 * is the production path: the OAuth callback would set the same session cookie
 * after verifying the IdP assertion.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value;
  if (!userId) return null;
  const repo = getRepository();
  const user = await repo.getUserById(userId);
  if (!user) return null;
  return { user, tenantId: user.tenant_id };
}

/** Throw-if-unauthenticated helper for server actions / route handlers. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated");
  return s;
}

export async function requireRole(min: Role): Promise<Session> {
  const s = await requireSession();
  if (!hasRole(s.user.role, min)) {
    throw new Error(`Requires ${min} role (you are ${s.user.role})`);
  }
  return s;
}

/** Local-mode login: match a seeded user by email in the demo tenant. */
export async function loginLocal(email: string): Promise<User | null> {
  const repo = getRepository();
  const user = await repo.getUserByEmail(DEMO_TENANT_ID, email);
  if (!user) return null;
  const jar = await cookies();
  jar.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
