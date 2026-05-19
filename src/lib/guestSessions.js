// Guest-session client lib (#20). A guest's completed sessions are
// stashed in sessionStorage under GUEST_SESSIONS_KEY until either the
// player signs in (at which point we flush them to /api/me/sessions/merge
// so they fold into the new account's history) or the tab closes (the
// sessionStorage entry goes with it — no persistence beyond the tab).
//
// Separate from the in-progress game-state key (`policyWonk:gameState`),
// which holds at most one game-in-progress for refresh survival.

const GUEST_SESSIONS_KEY = "policyWonk:guestSessions";
const MERGE_ENDPOINT = "/api/me/sessions/merge";
const MAX_STASHED = 100;

function readArray() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage?.getItem(GUEST_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeArray(arr) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(GUEST_SESSIONS_KEY, JSON.stringify(arr));
  } catch {
    // sessionStorage unavailable — guest doesn't get history merged later.
  }
}

export function clearGuestSessions() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(GUEST_SESSIONS_KEY);
  } catch {
    // best-effort
  }
}

// Append one completed guest session. Deduped by client_id so a refresh
// of the end screen, a StrictMode double-mount, or a stray retry won't
// stash the same game twice.
export function stashGuestSession(payload) {
  if (!payload || typeof payload !== "object") return;
  if (!payload.client_id) return;
  const arr = readArray();
  if (arr.some((s) => s?.client_id === payload.client_id)) return;
  arr.push(payload);
  // Cap to guard against runaway storage. We keep the most recent.
  const trimmed = arr.length > MAX_STASHED ? arr.slice(-MAX_STASHED) : arr;
  writeArray(trimmed);
}

// POST stashed sessions to the merge endpoint. Server returns 401 when
// the caller is unauthenticated — in that case we keep the storage so a
// later authenticated page load picks it up. 2xx clears it; 4xx other
// than 401 also clears (assume the payload is permanently invalid so
// we don't retry forever); 5xx and network errors leave it for retry.
export async function flushGuestSessions() {
  if (typeof window === "undefined") return { attempted: false };
  const sessions = readArray();
  if (sessions.length === 0) return { attempted: false };
  try {
    const res = await fetch(MERGE_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    if (res.ok) {
      clearGuestSessions();
      return { attempted: true, ok: true };
    }
    if (res.status === 401) {
      // Still a guest — keep the stash for the next authenticated load.
      return { attempted: true, ok: false, unauthorized: true };
    }
    if (res.status >= 400 && res.status < 500) {
      // Validation-class failure on stale/bad payload. Don't retry forever.
      clearGuestSessions();
      return { attempted: true, ok: false, dropped: true };
    }
    // 5xx — leave for retry.
    return { attempted: true, ok: false };
  } catch {
    // Network — leave for retry.
    return { attempted: true, ok: false };
  }
}
