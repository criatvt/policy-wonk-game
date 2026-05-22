// D1 queries that back the admin pages.
//
// Read-only — no inserts, no updates. Per #26, Phase 1 admin is purely
// observational. Update / delete operations are out of scope and would
// belong in a follow-up issue.

export const ADMIN_MODULE_IDS = [
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
] as const;

export type AdminOutcome = "won" | "lost" | "walked_away";

export type DashboardStats = {
  total_users: number;
  signups_last_7d: number;
  sessions_today: number;
  most_played_module: { module_id: string; count: number } | null;
};

export async function getDashboardStats(db: D1Database): Promise<DashboardStats> {
  // Run the four queries in parallel — they hit different tables / aggregates.
  const [totalRow, weekRow, todayRow, topModuleRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')",
      )
      .first<{ n: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM sessions WHERE created_at >= datetime('now', 'start of day')",
      )
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT module_id, COUNT(*) AS n
         FROM sessions
         GROUP BY module_id
         ORDER BY n DESC
         LIMIT 1`,
      )
      .first<{ module_id: string; n: number }>(),
  ]);

  return {
    total_users: totalRow?.n ?? 0,
    signups_last_7d: weekRow?.n ?? 0,
    sessions_today: todayRow?.n ?? 0,
    most_played_module: topModuleRow
      ? { module_id: topModuleRow.module_id, count: topModuleRow.n }
      : null,
  };
}

export type AdminUserRow = {
  id: string;
  email: string;
  nickname: string | null;
  avatar_slug: string | null;
  is_admin: number;
  created_at: string;
  last_login_at: string | null;
  session_count: number;
};

export type ListUsersOpts = {
  search?: string;
  page: number;
  pageSize: number;
};

export type ListUsersResult = {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listUsers(
  db: D1Database,
  opts: ListUsersOpts,
): Promise<ListUsersResult> {
  const page = Math.max(1, opts.page | 0);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize | 0));
  const offset = (page - 1) * pageSize;
  const search = (opts.search ?? "").trim().toLowerCase();
  const hasSearch = search.length > 0;
  // LIKE pattern with wildcards on both sides; escapeLike() handles the
  // %/_ characters in user input.
  const likePattern = hasSearch ? `%${escapeLike(search)}%` : "";

  const whereClause = hasSearch ? "WHERE LOWER(u.email) LIKE ? ESCAPE '\\'" : "";
  const params: unknown[] = hasSearch ? [likePattern] : [];

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM users u ${whereClause}`)
    .bind(...params)
    .first<{ n: number }>();

  const rowsResult = await db
    .prepare(
      `SELECT
         u.id, u.email, u.nickname, u.avatar_slug, u.is_admin,
         u.created_at, u.last_login_at,
         (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count
       FROM users u
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all<AdminUserRow>();

  return {
    users: rowsResult.results ?? [],
    total: countRow?.n ?? 0,
    page,
    pageSize,
  };
}

export type AdminSessionRow = {
  id: string;
  user_id: string;
  module_id: string;
  client_id: string;
  started_at: string;
  ended_at: string;
  score: number;
  highest_cleared_rung: number;
  outcome: AdminOutcome;
  walk_away_tier: string | null;
  lifelines_used: string; // JSON
  created_at: string;
  user_email: string;
  user_nickname: string | null;
};

export type UserDetail = {
  user: {
    id: string;
    email: string;
    nickname: string | null;
    avatar_slug: string | null;
    is_admin: number;
    created_at: string;
    last_login_at: string | null;
  };
  played_modules: string[];
  sessions: AdminSessionRow[];
};

export async function getUserDetail(
  db: D1Database,
  id: string,
): Promise<UserDetail | null> {
  const userRow = await db
    .prepare(
      `SELECT id, email, nickname, avatar_slug, is_admin, created_at, last_login_at
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{
      id: string;
      email: string;
      nickname: string | null;
      avatar_slug: string | null;
      is_admin: number;
      created_at: string;
      last_login_at: string | null;
    }>();
  if (!userRow) return null;

  const sessionsResult = await db
    .prepare(
      `SELECT s.*, u.email AS user_email, u.nickname AS user_nickname
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ?
       ORDER BY s.ended_at DESC
       LIMIT 500`,
    )
    .bind(id)
    .all<AdminSessionRow>();

  const sessions = sessionsResult.results ?? [];
  const played = Array.from(new Set(sessions.map((s) => s.module_id))).sort();

  return { user: userRow, played_modules: played, sessions };
}

export type ListSessionsOpts = {
  moduleId?: string;
  outcome?: AdminOutcome;
  since?: string; // ISO date (YYYY-MM-DD)
  until?: string; // ISO date (YYYY-MM-DD)
  page: number;
  pageSize: number;
};

export type ListSessionsResult = {
  sessions: AdminSessionRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listRecentSessions(
  db: D1Database,
  opts: ListSessionsOpts,
): Promise<ListSessionsResult> {
  const page = Math.max(1, opts.page | 0);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize | 0));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.moduleId) {
    where.push("s.module_id = ?");
    params.push(opts.moduleId);
  }
  if (opts.outcome) {
    where.push("s.outcome = ?");
    params.push(opts.outcome);
  }
  if (opts.since) {
    where.push("s.ended_at >= ?");
    params.push(opts.since);
  }
  if (opts.until) {
    // until is treated as "end of that day" — add a day so the inclusive
    // upper bound covers sessions that ended on the chosen date.
    where.push("s.ended_at < date(?, '+1 day')");
    params.push(opts.until);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM sessions s ${whereClause}`)
    .bind(...params)
    .first<{ n: number }>();

  const rowsResult = await db
    .prepare(
      `SELECT s.*, u.email AS user_email, u.nickname AS user_nickname
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       ${whereClause}
       ORDER BY s.ended_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all<AdminSessionRow>();

  return {
    sessions: rowsResult.results ?? [],
    total: countRow?.n ?? 0,
    page,
    pageSize,
  };
}

// Escape user input for use inside a LIKE pattern. The query uses
// ESCAPE '\' so '\%' and '\_' are taken literally.
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
