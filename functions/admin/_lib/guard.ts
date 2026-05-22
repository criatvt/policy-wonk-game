// Admin authorization for /admin/* requests.
//
// Reads the session cookie, looks up the user by id, and confirms is_admin
// is set. Returns the admin user or null. Routes that fail the check
// render a generic Not Found page — the issue calls for 404 (not 403) so
// the existence of the admin tree is not leaked.
//
// is_admin is checked LIVE on every request (not baked into the JWT), so
// revoking admin status is one column update — no need to invalidate
// existing sessions.

import type { Context } from "hono";
import { readSession } from "../../api/_lib/session";
import { findUserById, type User } from "../../api/_lib/users";

// Minimum bindings the guard depends on. Routes that mount the guard can
// have a wider Bindings shape — generic kept loose on purpose.
type GuardBindings = {
  DB: D1Database;
  SESSION_SECRET?: string;
};

export async function loadAdminUser<B extends GuardBindings>(
  c: Context<{ Bindings: B }>,
): Promise<User | null> {
  if (!c.env.SESSION_SECRET) return null;
  const claims = await readSession(c, c.env.SESSION_SECRET);
  if (!claims) return null;

  const user = await findUserById(c.env.DB, claims.sub);
  if (!user) return null;
  if (user.is_admin !== 1) return null;

  return user;
}
