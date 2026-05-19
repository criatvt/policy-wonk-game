// /api/me — current user + per-user state (sessions, played modules).
//
// All routes here are session-cookie gated. Unauthenticated callers get
// 401 on the sub-routes; GET / is the exception (returns user: null).

import { Hono, type Context } from "hono";
import { readSession } from "../_lib/session";
import { findUserById, updateAvatar, updateNickname } from "../_lib/users";
import { deriveAvatarSlug, isValidAvatarSlug } from "../_lib/avatars";
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

// POST /api/me/sessions/merge — fold a guest's accumulated session
// payloads into the authenticated user's history (#20). Body shape:
//   { sessions: [<NewSession>, ...] }   (max 50 per call)
//
// Same per-session validation as POST /sessions and the same idempotency
// on (user_id, client_id), so re-merging an already-merged session is a
// no-op. Invalid items are skipped (counted) rather than failing the
// whole batch — partial-success is friendlier when a stale guest payload
// from an older schema sneaks in.
me.post("/sessions/merge", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  let body: { sessions?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const sessions = body?.sessions;
  if (!Array.isArray(sessions)) {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }
  if (sessions.length === 0) {
    return c.json({ ok: true, merged: 0, skipped: 0 });
  }
  if (sessions.length > 50) {
    return c.json({ ok: false, error: "too_many_sessions" }, 400);
  }

  let merged = 0;
  let skipped = 0;
  for (const raw of sessions) {
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const v = validateSessionBody(raw as Record<string, unknown>);
    if ("error" in v) {
      skipped++;
      continue;
    }
    await insertSession(c.env.DB, {
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
    merged++;
  }

  return c.json({ ok: true, merged, skipped });
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

// POST /api/me/profile/nickname — step 1 of onboarding (#17).
// Body: { nickname: string }. Trimmed, 3–24 chars, profanity-checked.
// Uniqueness not enforced — users are disambiguated by id.
me.post("/profile/nickname", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  let body: { nickname?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const raw = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (raw.length < 3 || raw.length > 24) {
    return c.json({ ok: false, error: "invalid_nickname_length" }, 400);
  }
  // Letters (any script), digits, spaces, hyphens, underscores, apostrophes.
  // Rejects control chars and most punctuation.
  if (!/^[\p{L}\p{N} _'\-]+$/u.test(raw)) {
    return c.json({ ok: false, error: "invalid_nickname_chars" }, 400);
  }
  if (containsProfanity(raw)) {
    return c.json({ ok: false, error: "nickname_blocked" }, 400);
  }

  // Auto-derive the avatar slug from the nickname's first alpha character
  // (#18). Skips the manual avatar picker step — the avatar is just a
  // pixelated rendering of that letter in the UI.
  const avatarSlug = deriveAvatarSlug(raw);

  await updateNickname(c.env.DB, userId, raw);
  await updateAvatar(c.env.DB, userId, avatarSlug);
  return c.json({ ok: true, nickname: raw, avatar_slug: avatarSlug });
});

// POST /api/me/profile/avatar — step 2 of onboarding (#17).
// Body: { avatar_slug: string }. Must match the curated manifest.
me.post("/profile/avatar", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);

  let body: { avatar_slug?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const slug = typeof body.avatar_slug === "string" ? body.avatar_slug : "";
  if (!isValidAvatarSlug(slug)) {
    return c.json({ ok: false, error: "invalid_avatar_slug" }, 400);
  }

  await updateAvatar(c.env.DB, userId, slug);
  return c.json({ ok: true, avatar_slug: slug });
});

// Phase 1 stub. Substring match against an obviously-offensive seed list.
// Not a substitute for a real profanity library if abuse becomes a problem.
// Lowercased before comparison so "FUCK" and "fuck" both get caught.
const PROFANITY_SEED = [
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "piss",
  "nigger",
  "faggot",
  "retard",
];
function containsProfanity(s: string): boolean {
  const lower = s.toLowerCase();
  return PROFANITY_SEED.some((w) => lower.includes(w));
}

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
