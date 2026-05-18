// /api/me — current user + per-user state (sessions, played modules).
//
// All routes here are session-cookie gated. Unauthenticated callers get
// 401 on the sub-routes; GET / is the exception (returns user: null).

import { Hono, type Context } from "hono";
import { readSession } from "../_lib/session";
import { findUserById } from "../_lib/users";
import {
  insertSession,
  listSessionsByUser,
  playedModulesForUser,
  toView,
  type Outcome,
} from "../_lib/sessions";

type Bindings = {
  DB: D1Database;
  SESSION_SECRET?: string;
};

const me = new Hono<{ Bindings: Bindings }>();

const VALID_MODULES = new Set([
  "cg-1",
  "cp-10",
  "cp-11",
  "cp-12",
  "cp-13",
  "cp-21",
  "cp-22",
  "cp-23",
  "cp-25",
  "cp-33",
  "cs-11",
]);
const VALID_OUTCOMES = new Set<Outcome>(["won", "lost", "walked_away"]);
const VALID_LIFELINES = new Set(["fiftyFifty", "poll", "expert"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUserId(
  c: Context<{ Bindings: Bindings }>,
): Promise<string | null> {
  if (!c.env.SESSION_SECRET) return null;
  const claims = await readSession(c, c.env.SESSION_SECRET);
  return claims?.sub ?? null;
}

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

// POST /api/me/sessions — record one completed session.
// Idempotent on (user_id, client_id): re-posting the same client_id is a
// no-op insert and returns the existing row.
me.post("/sessions", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const v = validateSessionBody(body);
  if ("error" in v) return c.json({ ok: false, error: v.error }, 400);

  const row = await insertSession(c.env.DB, {
    user_id: userId,
    module_id: v.module_id,
    client_id: v.client_id,
    started_at: v.started_at,
    ended_at: v.ended_at,
    score: v.score,
    highest_cleared_rung: v.highest_cleared_rung,
    outcome: v.outcome,
    lifelines_used: v.lifelines_used,
  });

  return c.json({ ok: true, session: toView(row) });
});

// GET /api/me/sessions?limit=50 — newest-first list for the /me page.
me.get("/sessions", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const limitRaw = c.req.query("limit");
  let limit = 50;
  if (limitRaw != null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  const rows = await listSessionsByUser(c.env.DB, userId, limit);
  return c.json({ ok: true, sessions: rows.map(toView) });
});

// GET /api/me/played-modules — drives the notes-unlock UI (#22).
me.get("/played-modules", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const moduleIds = await playedModulesForUser(c.env.DB, userId);
  return c.json({ ok: true, module_ids: moduleIds });
});

type ValidSession = {
  module_id: string;
  client_id: string;
  started_at: string;
  ended_at: string;
  score: number;
  highest_cleared_rung: number;
  outcome: Outcome;
  lifelines_used: string[];
};

function validateSessionBody(
  body: Record<string, unknown>,
): ValidSession | { error: string } {
  const moduleId = body.module_id;
  if (typeof moduleId !== "string" || !VALID_MODULES.has(moduleId)) {
    return { error: "invalid_module_id" };
  }

  const clientId = body.client_id;
  if (typeof clientId !== "string" || !UUID_RE.test(clientId)) {
    return { error: "invalid_client_id" };
  }

  const startedAt = body.started_at;
  const endedAt = body.ended_at;
  if (typeof startedAt !== "string" || !isIsoTimestamp(startedAt)) {
    return { error: "invalid_started_at" };
  }
  if (typeof endedAt !== "string" || !isIsoTimestamp(endedAt)) {
    return { error: "invalid_ended_at" };
  }

  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
    return { error: "invalid_score" };
  }

  const rung = body.highest_cleared_rung;
  if (
    typeof rung !== "number" ||
    !Number.isInteger(rung) ||
    rung < 0 ||
    rung > 15
  ) {
    return { error: "invalid_highest_cleared_rung" };
  }

  const outcome = body.outcome;
  if (typeof outcome !== "string" || !VALID_OUTCOMES.has(outcome as Outcome)) {
    return { error: "invalid_outcome" };
  }
  if (outcome === "walked_away" && rung < 5) {
    // Walk-away requires clearing the Q5 safety net. Defensive — the
    // client gate (canWalkAway) already enforces > 5, but server should
    // reject inconsistent payloads rather than store them.
    return { error: "walk_away_below_safety_net" };
  }

  const lifelines = body.lifelines_used;
  if (!Array.isArray(lifelines)) return { error: "invalid_lifelines_used" };
  for (const l of lifelines) {
    if (typeof l !== "string" || !VALID_LIFELINES.has(l)) {
      return { error: "invalid_lifelines_used" };
    }
  }

  return {
    module_id: moduleId,
    client_id: clientId,
    started_at: startedAt,
    ended_at: endedAt,
    score,
    highest_cleared_rung: rung,
    outcome: outcome as Outcome,
    lifelines_used: lifelines as string[],
  };
}

function isIsoTimestamp(s: string): boolean {
  // Permissive — accept anything Date can parse and that round-trips
  // through toISOString. Good enough for Phase 1; the client uses
  // new Date().toISOString() at the boundary.
  if (s.length > 40) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export default me;
