// Quiz session CRUD against D1.
//
// Schema lives in migrations/0002_sessions.sql. One row per completed
// session (won / lost / walked_away). played_modules for the notes-unlock
// rule is derived from this table — there is no separate aggregate.

export type Outcome = "won" | "lost" | "walked_away";
export type WalkAwayTier = "medium" | "hard" | "expert";

export type SessionRow = {
  id: string;
  user_id: string;
  module_id: string;
  client_id: string;
  started_at: string;
  ended_at: string;
  score: number;
  highest_cleared_rung: number;
  outcome: Outcome;
  walk_away_tier: WalkAwayTier | null;
  lifelines_used: string; // JSON
  created_at: string;
};

export type SessionView = Omit<SessionRow, "user_id" | "lifelines_used"> & {
  lifelines_used: string[];
};

export type NewSession = {
  user_id: string;
  module_id: string;
  client_id: string;
  started_at: string;
  ended_at: string;
  score: number;
  highest_cleared_rung: number;
  outcome: Outcome;
  lifelines_used: string[];
};

// Walk-away is only allowed at Q6+, so the tier is always medium or above.
// Tiers match the ladder boundaries in src/lib/gameEngine.js.
export function walkAwayTierFor(rung: number): WalkAwayTier {
  if (rung >= 13) return "expert";
  if (rung >= 9) return "hard";
  return "medium";
}

export function toView(row: SessionRow): SessionView {
  let lifelines: string[] = [];
  try {
    const parsed = JSON.parse(row.lifelines_used);
    if (Array.isArray(parsed)) lifelines = parsed.filter((s) => typeof s === "string");
  } catch {
    // Malformed JSON in DB — treat as empty rather than 500 the caller.
  }
  const { user_id: _userId, lifelines_used: _raw, ...rest } = row;
  return { ...rest, lifelines_used: lifelines };
}

// Insert, or return the existing row if (user_id, client_id) already
// exists. Idempotency guard against StrictMode double-mount, refresh, or
// network retry from EndScreen.
export async function insertSession(
  db: D1Database,
  s: NewSession,
): Promise<SessionRow> {
  const existing = await db
    .prepare(
      "SELECT * FROM sessions WHERE user_id = ? AND client_id = ? LIMIT 1",
    )
    .bind(s.user_id, s.client_id)
    .first<SessionRow>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const walkAwayTier =
    s.outcome === "walked_away" ? walkAwayTierFor(s.highest_cleared_rung) : null;
  const lifelinesJson = JSON.stringify(s.lifelines_used);

  await db
    .prepare(
      `INSERT INTO sessions (
        id, user_id, module_id, client_id,
        started_at, ended_at, score, highest_cleared_rung,
        outcome, walk_away_tier, lifelines_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      s.user_id,
      s.module_id,
      s.client_id,
      s.started_at,
      s.ended_at,
      s.score,
      s.highest_cleared_rung,
      s.outcome,
      walkAwayTier,
      lifelinesJson,
    )
    .run();

  const inserted = await db
    .prepare("SELECT * FROM sessions WHERE id = ? LIMIT 1")
    .bind(id)
    .first<SessionRow>();
  // SQLite always returns the row we just inserted; non-null is safe.
  return inserted as SessionRow;
}

export async function listSessionsByUser(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<SessionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM sessions WHERE user_id = ? ORDER BY ended_at DESC LIMIT ?",
    )
    .bind(userId, limit)
    .all<SessionRow>();
  return result.results ?? [];
}

export async function playedModulesForUser(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      "SELECT DISTINCT module_id FROM sessions WHERE user_id = ? ORDER BY module_id",
    )
    .bind(userId)
    .all<{ module_id: string }>();
  return (result.results ?? []).map((r) => r.module_id);
}
