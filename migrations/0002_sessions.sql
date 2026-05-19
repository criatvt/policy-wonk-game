-- Phase 1 / #21 + #22 — completed quiz sessions.
--
-- One row per session that reached an end state (won / lost / walked_away).
-- Mid-quiz bouncing does not produce a row (the client posts only on
-- EndScreen mount). played_modules (#22) is derived from this table with
-- SELECT DISTINCT module_id WHERE user_id = ?.

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,            -- server-generated UUID
  user_id               TEXT NOT NULL,
  module_id             TEXT NOT NULL,
  client_id             TEXT NOT NULL,               -- client-generated UUID for idempotency
  started_at            TEXT NOT NULL,               -- ISO 8601
  ended_at              TEXT NOT NULL,               -- ISO 8601
  score                 INTEGER NOT NULL,
  highest_cleared_rung  INTEGER NOT NULL,            -- 0–15
  outcome               TEXT NOT NULL CHECK (outcome IN ('won','lost','walked_away')),
  walk_away_tier        TEXT,                        -- 'medium' | 'hard' | 'expert'; null otherwise
  lifelines_used        TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_ended ON sessions(user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_module ON sessions(user_id, module_id);
