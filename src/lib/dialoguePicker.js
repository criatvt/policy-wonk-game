// Picks an Iqbal Ji line for a given beat, applies runtime substitutions
// ([name], [option], [correct], [X]), and strips directorial markers
// ([pause], [beat], [warmly], etc.) from the rendered text.
//
// Spec: 07-dialogue-script.md.
// CLAUDE.md rule: never invent a line. Only return what dialogue.json
// holds. If a beat is missing, return null and surface a console warning
// (handled by the caller).

import dialogue from "../data/dialogue.json";

// Markers that are SUBSTITUTIONS (kept and replaced at runtime).
// Markers that are DIRECTORIAL (stripped from rendered text).
const SUBSTITUTION_KEYS = new Set(["name", "option", "correct", "x"]);

// Audience-mode beats per spec — caller checks .audienceMode on the
// returned object to apply visual class.
const AUDIENCE_MODE_BEATS = new Set([
  "tier-3-fourth-wall-cheating",
  "tier-4-ethics-aside",
]);

// Expression mapping per 07-dialogue-script.md §"Implementation notes".
function expressionFor(beat) {
  if (beat.startsWith("correct-") || beat === "won" || beat === "won-share-prompt") {
    return "smiling";
  }
  if (beat.startsWith("wrong-") || beat === "lost" || beat === "lost-nudge") {
    return "sad";
  }
  if (AUDIENCE_MODE_BEATS.has(beat)) return "sad";
  return "neutral";
}

// Strip directorial markers like [pause], [beat], [warmly], [To audience].
// Keep substitution markers ([name], [option], [correct], [X]) intact for
// the substitution pass.
function stripDirectorialMarkers(text) {
  return text
    .replace(/\[([^\]]+)\]/g, (full, inner) => {
      const key = inner.trim().toLowerCase();
      if (SUBSTITUTION_KEYS.has(key)) return full;
      return ""; // strip
    })
    .replace(/\s{2,}/g, " ") // collapse runs of whitespace from stripped markers
    .trim();
}

function applySubstitutions(text, subs) {
  let out = text;
  if (subs.name != null) out = out.replace(/\[name\]/gi, subs.name);
  if (subs.option != null) out = out.replace(/\[option\]/gi, subs.option);
  if (subs.correct != null) out = out.replace(/\[correct\]/gi, subs.correct);
  if (subs.x != null) out = out.replace(/\[x\]/gi, subs.x);
  return out;
}

// Returns { text, expression, audienceMode } or null if beat unknown.
export function pickLine(beat, subs = {}, opts = {}) {
  const mode = opts.mode ?? "english";
  const rng = opts.rng ?? Math.random;
  const variants = dialogue[mode]?.[beat];
  if (!variants || variants.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(`dialoguePicker: no line for beat "${beat}" in mode "${mode}"`);
    }
    return null;
  }
  const raw = variants[Math.floor(rng() * variants.length)];
  const stripped = stripDirectorialMarkers(raw);
  const text = applySubstitutions(stripped, subs);
  return {
    text,
    expression: expressionFor(beat),
    audienceMode: AUDIENCE_MODE_BEATS.has(beat),
  };
}

// Picks the right correct/wrong-{tier} variant based on difficulty.
export function pickCorrectLine(difficulty, subs, opts) {
  return pickLine(`correct-${difficulty}`, subs, opts);
}
export function pickWrongLine(difficulty, subs, opts) {
  return pickLine(`wrong-${difficulty}`, subs, opts);
}
export function pickTierIntro(tier, subs, opts) {
  return pickLine(`tier-${tier}-question-intro`, subs, opts);
}
export function pickModuleIntro(group, subs, opts) {
  const slug = group
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return pickLine(`module-intro-${slug}`, subs, opts);
}

// Picks an expert AI line. Tag is "correct" | "wrong" | "useless" — caller
// decides which based on the verdict from lifelineLogic.expertVerdict.
// experts is the array from experts.json. Returns { text, useless } or null.
export function pickExpertLine(experts, expertId, tag, subs = {}, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const expert = experts.find((e) => e.id === expertId);
  if (!expert) return null;
  let pool = expert.lines?.[tag];
  // Fallback: if tag has no lines (e.g. niteen has no "wrong" lines),
  // use "useless" as the next-best bucket so the player still gets
  // a verdict-shaped response.
  if (!pool || pool.length === 0) {
    pool = expert.lines?.useless ?? [];
    if (pool.length === 0) return null;
  }
  const raw = pool[Math.floor(rng() * pool.length)];
  const stripped = stripDirectorialMarkers(raw);
  const text = applySubstitutions(stripped, subs);
  return { text, expert };
}
