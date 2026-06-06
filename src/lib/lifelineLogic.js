// Pure logic for the three lifelines. UI lives in Lifelines.jsx;
// state transitions live in gameEngine.js. These helpers do the work.
//
// Spec: 02-game-design.md §"Lifelines"

// 50:50 — drop two of the three wrong options, leaving one wrong + the
// correct one. We don't know which is correct on the runtime side
// without hashing, so the caller passes the correct option index
// (recovered post-lock OR pre-lock by hashing once for this lifeline).
//
// Returns the indices of the TWO options to eliminate. Caller stores
// them in state.fiftyFiftyEliminated.
export function fiftyFiftyEliminate(correctIndex, rng = Math.random) {
  const wrong = [0, 1, 2, 3].filter((i) => i !== correctIndex);
  // Shuffle wrong list, take first two
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return [wrong[0], wrong[1]].sort((a, b) => a - b);
}

// Audience Poll — fake but believable distribution. The audience tracks
// difficulty: cruisier on easy, ~coin-flip on hard, near-uniform on
// expert. Always sums to 100 (rounded).
//
// Returns an array of 4 ints summing to 100, indexed by option position.
const POLL_PROFILES = {
  easy:   { correctRange: [70, 85], jitter: 5 },
  medium: { correctRange: [50, 65], jitter: 5 },
  hard:   { correctRange: [35, 50], jitter: 5 },
  expert: { correctRange: [35, 45], jitter: 5 },
};

export function generateAudiencePoll(correctIndex, difficulty, rng = Math.random) {
  const profile = POLL_PROFILES[difficulty] ?? POLL_PROFILES.medium;
  const [lo, hi] = profile.correctRange;
  const correctPct = Math.round(lo + rng() * (hi - lo));
  const remaining = 100 - correctPct;

  // Distribute remaining across the 3 wrong options with mild variance.
  // Start with an even split, then jitter ±jitter%, then renormalise.
  const wrongIndices = [0, 1, 2, 3].filter((i) => i !== correctIndex);
  const baseShare = remaining / 3;
  let raw = wrongIndices.map(() => baseShare + (rng() - 0.5) * 2 * profile.jitter);
  // Clamp non-negative, renormalise to remaining
  raw = raw.map((v) => Math.max(0, v));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  raw = raw.map((v) => (v * remaining) / sum);

  // Round and adjust to make total exactly 100
  const result = [0, 0, 0, 0];
  result[correctIndex] = correctPct;
  let runningSum = correctPct;
  for (let k = 0; k < wrongIndices.length; k++) {
    const idx = wrongIndices[k];
    const isLast = k === wrongIndices.length - 1;
    const v = isLast ? Math.max(0, 100 - runningSum) : Math.round(raw[k]);
    result[idx] = v;
    runningSum += v;
  }
  return result;
}

// Ask Your Professor — the professor ALWAYS recommends the correct
// answer (issue #3, 2026-06-06). The earlier reliability roll and the
// wrong-pick path are retired: the lifeline is now a reliable hint
// delivered in character (a short lecture, then the answer). Kept as a
// function — rather than inlined at the call site — so the caller's
// shape ({ pickedIndex, gotItRight }) is unchanged and a future
// "unreliable expert" mode can be reinstated here (alongside the
// archived wrong/useless pools in experts.json) without touching the UI.
export function expertVerdict(expert, correctIndex) {
  return { pickedIndex: correctIndex, gotItRight: true };
}
