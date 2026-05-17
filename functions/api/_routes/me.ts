// /api/me — current user, derived from the session cookie.

import { Hono } from "hono";
import { readSession } from "../_lib/session";
import { findUserById } from "../_lib/users";

type Bindings = {
  DB: D1Database;
  SESSION_SECRET?: string;
};

const me = new Hono<{ Bindings: Bindings }>();

me.get("/", async (c) => {
  if (!c.env.SESSION_SECRET) {
    return c.json({ ok: false, error: "server_not_configured" }, 500);
  }

  const claims = await readSession(c, c.env.SESSION_SECRET);
  if (!claims) {
    return c.json({ ok: true, user: null });
  }

  const user = await findUserById(c.env.DB, claims.sub);
  if (!user) {
    // Session cookie references a deleted user — treat as unauthenticated.
    return c.json({ ok: true, user: null });
  }

  // Strip is_admin from the response — not a user-facing concern. Admin
  // gating happens at the /admin route level (#26).
  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar_slug: user.avatar_slug,
      created_at: user.created_at,
    },
  });
});

export default me;
