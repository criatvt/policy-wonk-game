// User CRUD against D1.
//
// Schema lives in migrations/0001_users.sql. This module wraps the queries
// we'll reuse across route handlers so the route code stays focused on
// HTTP concerns.

export type User = {
  id: string;
  email: string;
  nickname: string | null;
  avatar_slug: string | null;
  is_admin: number;
  created_at: string;
  last_login_at: string | null;
};

function newUserId(): string {
  return crypto.randomUUID();
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<User>();
  return result ?? null;
}

// Insert if new, or just touch last_login_at if returning. Returns the
// user record either way.
export async function upsertUserOnLogin(
  db: D1Database,
  email: string,
  adminEmails: string[],
): Promise<User> {
  const existing = await findUserByEmail(db, email);
  const now = new Date().toISOString();

  if (existing) {
    await db
      .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
      .bind(now, existing.id)
      .run();
    return { ...existing, last_login_at: now };
  }

  const id = newUserId();
  const isAdmin = adminEmails.includes(email) ? 1 : 0;

  await db
    .prepare(
      "INSERT INTO users (id, email, is_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, email, isAdmin, now, now)
    .run();

  return {
    id,
    email,
    nickname: null,
    avatar_slug: null,
    is_admin: isAdmin,
    created_at: now,
    last_login_at: now,
  };
}

export async function findUserById(
  db: D1Database,
  id: string,
): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE id = ? LIMIT 1")
    .bind(id)
    .first<User>();
  return result ?? null;
}
