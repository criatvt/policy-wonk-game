-- Phase 1 / #15 — initial users table.
--
-- Foundation only. Sessions (#21), played_modules (#22), and magic-link
-- tokens (#16) get their own migrations as those issues land.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                -- UUID generated server-side
  email           TEXT NOT NULL UNIQUE,
  nickname        TEXT,                            -- set during onboarding (#17)
  avatar_slug     TEXT,                            -- references public/avatars/<slug>.png (#18)
  is_admin        INTEGER NOT NULL DEFAULT 0,      -- bool; 1 for admin allowlist (#26)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
