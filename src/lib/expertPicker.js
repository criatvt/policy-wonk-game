// Picks a professor's line for the "Ask Your Professor" lifeline, applies
// runtime substitutions ([option]) and strips directorial markers
// ([pause], etc.).
//
// Three caricatured professors (Nithen / Pranai / Anoopam) speak directly —
// the Wonky host was deferred at the 2026-05-09 call, and the fourth expert
// (Saarthak) was dropped at issue #3. Per #3 the recommended answer is now
// always correct (see expertVerdict in lifelineLogic.js), so in practice
// `tag` is always "correct".

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
// Tag is normally "correct" (the only pool the active professors carry
// since #3). Falls back to "useless" if a caller ever requests a tag the
// expert has no lines for; returns null if that fallback is also empty.
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
