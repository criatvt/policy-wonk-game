// Game engine — pure logic for the 15-question ladder. No DOM, no React.
// React components import these helpers and the LADDER constant.
//
// Spec references:
//   - 02-game-design.md: ladder, safety nets, lifelines, walk-away rules
//   - 04-question-schema.md: difficulty buckets, runtime question shape

export const LADDER = [
  { rung: 1,  tier: 1, difficulty: "easy",   credibility:        1000, isSafetyNet: false },
  { rung: 2,  tier: 1, difficulty: "easy",   credibility:        2000, isSafetyNet: false },
  { rung: 3,  tier: 1, difficulty: "easy",   credibility:        5000, isSafetyNet: false },
  { rung: 4,  tier: 1, difficulty: "easy",   credibility:       10000, isSafetyNet: false },
  { rung: 5,  tier: 2, difficulty: "medium", credibility:       25000, isSafetyNet: true  },
  { rung: 6,  tier: 2, difficulty: "medium", credibility:       50000, isSafetyNet: false },
  { rung: 7,  tier: 2, difficulty: "medium", credibility:      100000, isSafetyNet: false },
  { rung: 8,  tier: 2, difficulty: "medium", credibility:      250000, isSafetyNet: false },
  { rung: 9,  tier: 3, difficulty: "hard",   credibility:      500000, isSafetyNet: false },
  { rung: 10, tier: 3, difficulty: "hard",   credibility:     1000000, isSafetyNet: true  },
  { rung: 11, tier: 3, difficulty: "hard",   credibility:     2000000, isSafetyNet: false },
  { rung: 12, tier: 3, difficulty: "hard",   credibility:     3500000, isSafetyNet: false },
  { rung: 13, tier: 4, difficulty: "expert", credibility:     5000000, isSafetyNet: false },
  { rung: 14, tier: 4, difficulty: "expert", credibility:     7500000, isSafetyNet: false },
  { rung: 15, tier: 4, difficulty: "expert", credibility:    10000000, isSafetyNet: false },
];

export const TIER_TIMER_SECONDS = { 1: 15, 2: 30, 3: 45, 4: 60 };

export function timerForRung(rung, question) {
  if (question?.timerOverride) return question.timerOverride;
  return TIER_TIMER_SECONDS[LADDER[rung - 1].tier];
}

// Indian numbering — lakhs (1,00,000) and crores (1,00,00,000). Used for
// score display per the game design doc.
export function formatIndianNumber(n) {
  if (n == null || isNaN(n)) return "0";
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
}

// If the player falls at currentRung (didn't answer it), they keep the
// credibility from the highest cleared safety net. Otherwise zero.
export function safetyNetScore(highestClearedRung) {
  let score = 0;
  for (const r of LADDER) {
    if (r.rung <= highestClearedRung && r.isSafetyNet) {
      score = r.credibility;
    }
  }
  return score;
}

// Score the player walks away with at currentRung (about to attempt it).
// They keep the credibility from the last cleared rung.
export function walkAwayScore(highestClearedRung) {
  if (highestClearedRung < 1) return 0;
  return LADDER[highestClearedRung - 1].credibility;
}

// Build the per-session question plan: pick N from each difficulty bucket,
// no repeats. Returns { plan: Question[15], warnings: string[] }.
//
// `bank` is the runtime question array (already shuffled options, hashed
// answers). `rng` is a function returning [0, 1) — pass Math.random for
// production, a seeded one for tests.
export function pickSessionQuestions(bank, rng = Math.random) {
  const buckets = { easy: [], medium: [], hard: [], expert: [] };
  for (const q of bank) {
    if (buckets[q.difficulty]) buckets[q.difficulty].push(q);
  }

  const plan = [];
  const warnings = [];
  const need = { easy: 4, medium: 4, hard: 4, expert: 3 };
  const fallback = { expert: "hard", hard: "medium", medium: "easy", easy: null };

  for (const tier of ["easy", "medium", "hard", "expert"]) {
    let chosen = sampleWithoutReplacement(buckets[tier], need[tier], rng);
    let cursor = tier;
    while (chosen.length < need[tier] && fallback[cursor]) {
      const short = need[tier] - chosen.length;
      warnings.push(
        `bucket "${cursor}" exhausted; falling back to "${fallback[cursor]}" for ${short} question(s)`,
      );
      cursor = fallback[cursor];
      const more = sampleWithoutReplacement(
        buckets[cursor].filter((q) => !chosen.includes(q)),
        short,
        rng,
      );
      chosen = chosen.concat(more);
    }
    if (chosen.length < need[tier]) {
      throw new Error(
        `cannot fill tier "${tier}": need ${need[tier]}, have ${chosen.length} after fallback`,
      );
    }
    plan.push(...chosen);
  }

  return { plan, warnings };
}

function sampleWithoutReplacement(arr, n, rng) {
  if (arr.length <= n) return arr.slice();
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Initial state for a new session. `name` and `moduleId` come from the
// onboarding flow; `plan` is the 15 chosen questions in ladder order.
export function createInitialState({ name, moduleId, plan }) {
  return {
    playerName: name,
    selectedModule: moduleId,
    plan,
    currentRung: 1,
    highestClearedRung: 0,
    selectedAnswer: null,
    answerLocked: false,
    explanation: null,
    correctIndex: null,
    lifelines: { fiftyFifty: true, poll: true, expert: true },
    fiftyFiftyEliminated: [],
    pollData: null,
    expertVerdict: null,
    status: "reveal-question",
    score: 0,
    fellOnRung: null,
    startTime: Date.now(),
    // Wall-clock timestamp at which the current question's timer started.
    // Set on the first handleRevealComplete for each rung; reset to null
    // when advancing. Used by the Timer to resume at the correct elapsed
    // value after a sessionStorage rehydrate.
    questionStartedAt: null,
    // Stable client-side id so the EndScreen POST to /api/me/sessions is
    // idempotent across StrictMode double-mount, refresh, or retry.
    clientSessionId: cryptoRandomUUID(),
  };
}

function cryptoRandomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers — Phase 1 supports modern only, but
  // don't crash the game if crypto.randomUUID is missing.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

// Status transitions. Each helper returns a new state — engine is pure.

export function selectOption(state, optionIndex) {
  if (state.answerLocked) return state;
  return { ...state, selectedAnswer: optionIndex };
}

export function lockAnswer(state) {
  if (state.selectedAnswer == null || state.answerLocked) return state;
  return { ...state, answerLocked: true, status: "locked" };
}

// Called after frontend computes hash and determines correctness.
// `correct` is a boolean. `correctIndex` is the index of the correct
// option (computed by hashing each option) — used to drive the reveal
// highlight when the player got it wrong.
export function reveal(state, correct, explanation, correctIndex) {
  const ladderRung = LADDER[state.currentRung - 1];
  if (correct) {
    return {
      ...state,
      status: "revealed-correct",
      highestClearedRung: state.currentRung,
      score: ladderRung.credibility,
      explanation,
      correctIndex,
    };
  }
  return {
    ...state,
    status: "revealed-wrong",
    fellOnRung: state.currentRung,
    score: safetyNetScore(state.highestClearedRung),
    explanation,
    correctIndex,
  };
}

export function advanceToNextQuestion(state) {
  if (state.status !== "revealed-correct") return state;
  if (state.currentRung >= 15) {
    return { ...state, status: "won" };
  }
  return {
    ...state,
    currentRung: state.currentRung + 1,
    selectedAnswer: null,
    answerLocked: false,
    explanation: null,
    correctIndex: null,
    fiftyFiftyEliminated: [],
    pollData: null,
    expertVerdict: null,
    status: "reveal-question",
    questionStartedAt: null,
  };
}

export function endAfterWrong(state) {
  if (state.status !== "revealed-wrong") return state;
  return { ...state, status: "lost" };
}

// Walk-away is only valid before locking, and only from rung 6 onwards
// (i.e. once the first safety net at Q5 has been cleared). Aasif's call
// (2026-05-09): walking away before the first safety net is too
// premature — there's no real money on the table yet.
export function canWalkAway(state) {
  return state.currentRung > 5 && !state.answerLocked && state.status === "reveal-question";
}

export function walkAway(state) {
  if (!canWalkAway(state)) return state;
  return {
    ...state,
    status: "walked-away",
    score: walkAwayScore(state.highestClearedRung),
  };
}

// Lifeline state transitions. Caller computes the result via
// lifelineLogic.js and passes it in.

export function applyFiftyFifty(state, eliminated) {
  if (!state.lifelines.fiftyFifty) return state;
  return {
    ...state,
    lifelines: { ...state.lifelines, fiftyFifty: false },
    fiftyFiftyEliminated: eliminated,
    // If the player had selected an eliminated option, clear it
    selectedAnswer: eliminated.includes(state.selectedAnswer) ? null : state.selectedAnswer,
  };
}

export function applyAudiencePoll(state, pollData) {
  if (!state.lifelines.poll) return state;
  return {
    ...state,
    lifelines: { ...state.lifelines, poll: false },
    pollData,
  };
}

export function applyExpert(state, expertId, line, pickedIndex) {
  if (!state.lifelines.expert) return state;
  return {
    ...state,
    lifelines: { ...state.lifelines, expert: false },
    expertVerdict: { expertId, line, pickedIndex },
  };
}

export function timeExpired(state) {
  if (state.answerLocked) return state;
  // Treat as wrong answer at the current rung.
  return {
    ...state,
    answerLocked: true,
    status: "revealed-wrong",
    fellOnRung: state.currentRung,
    score: safetyNetScore(state.highestClearedRung),
  };
}
