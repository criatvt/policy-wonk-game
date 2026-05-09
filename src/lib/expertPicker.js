// Picks an AI expert line for the Ask an AI lifeline, applies runtime
// substitutions ([option]) and strips directorial markers ([pause], etc.).
//
// The four caricatured experts (Nithen / Pranai / Anoopam / Saarthak) are
// retained per the 2026-05-09 call when the Wonky host character was
// deferred to a later release — the lifeline mechanic still works without
// the host since experts speak directly.

const SUBSTITUTION_KEYS = new Set(["option"]);

function stripDirectorialMarkers(text) {
  return text
    .replace(/\[([^\]]+)\]/g, (full, inner) => {
      const key = inner.trim().toLowerCase();
      if (SUBSTITUTION_KEYS.has(key)) return full;
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applySubstitutions(text, subs) {
  let out = text;
  if (subs.option != null) out = out.replace(/\[option\]/gi, subs.option);
  return out;
}

// Returns { text, expert } or null if expert/lines unknown.
// Tag is "correct" | "wrong" | "useless". Falls back to "useless" if the
// requested tag has no lines for this expert (e.g. Niteen has no "wrong"
// pool).
export function pickExpertLine(experts, expertId, tag, subs = {}, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const expert = experts.find((e) => e.id === expertId);
  if (!expert) return null;
  let pool = expert.lines?.[tag];
  if (!pool || pool.length === 0) {
    pool = expert.lines?.useless ?? [];
    if (pool.length === 0) return null;
  }
  const raw = pool[Math.floor(rng() * pool.length)];
  const stripped = stripDirectorialMarkers(raw);
  const text = applySubstitutions(stripped, subs);
  return { text, expert };
}
