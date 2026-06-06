import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import modules from "../../data/modules.json";
import expertsData from "../../data/experts.json";
import {
  LADDER,
  advanceToNextQuestion,
  applyAudiencePoll,
  applyExpert,
  applyFiftyFifty,
  canWalkAway,
  createInitialState,
  endAfterWrong,
  formatIndianNumber,
  lockAnswer,
  pickSessionQuestions,
  reveal,
  selectOption,
  timeExpired,
  timerForRung,
  walkAway,
  walkAwayScore,
} from "../../lib/gameEngine.js";
import {
  expertVerdict,
  fiftyFiftyEliminate,
  generateAudiencePoll,
} from "../../lib/lifelineLogic.js";
import { findCorrectIndex, isCorrect } from "../../lib/answerHash.js";
import { pickExpertLine } from "../../lib/expertPicker.js";
import { trackEvent } from "../../lib/analytics.js";
import Question from "./Question.jsx";
import Ladder from "./Ladder.jsx";
import Timer from "./Timer.jsx";
import EndScreen from "./EndScreen.jsx";
import Lifelines from "./Lifelines.jsx";

const EXPERTS = expertsData.experts;

// Inter-rung acknowledgement shown after a correct answer on Q1–Q14.
// KBC-style framing per Aasif's call (2026-05-09): every screen between
// rungs states (a) what the player scored on the previous question,
// (b) what's guaranteed if they get a future question wrong (the last
// safety net cleared), and (c) what's at stake on the next question.
// From Q11 onwards the body also explicitly mentions walk-away as an
// option — at those stakes the choice deserves to be spelled out, not
// just left as a button.
function rungMessage(cleared, scoreLabel, playerName) {
  const next = cleared + 1;
  const name = playerName?.trim() || "friend";

  // What you take home if you get a future question wrong, given safety
  // nets you've already passed.
  let guaranteed = 0;
  if (cleared >= 10) guaranteed = 1000000; // 10 lakh
  else if (cleared >= 5) guaranteed = 25000; // 25 thousand
  const consequence =
    guaranteed > 0
      ? `Get Q${next} wrong and you take home ${formatIndianNumber(guaranteed)} (the safety net).`
      : `Get Q${next} wrong and you take home nothing.`;

  // From Q11 onwards, also call out walk-away as an option in the body.
  const stakes =
    cleared >= 11
      ? `${consequence} Or walk away with ${scoreLabel} now.`
      : consequence;

  // Just cleared a safety net rung — the safety net IS the news.
  if (cleared === 5) {
    return {
      headline: `First safety net secured, ${name}.`,
      body: `25,000 credibility points are now guaranteed, even if you fall on a later question. Q6 awaits.`,
    };
  }
  if (cleared === 10) {
    return {
      headline: `Second safety net secured, ${name}.`,
      body: `10,00,000 credibility points are now guaranteed, even if you fall on a later question. Q11 awaits.`,
    };
  }

  // Tier transitions
  if (cleared === 4) {
    return {
      headline: `Tier 1 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q5 is the first safety net. ${stakes}`,
    };
  }
  if (cleared === 8) {
    return {
      headline: `Tier 2 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q9 starts the hard tier. ${stakes}`,
    };
  }
  if (cleared === 12) {
    return {
      headline: `Tier 3 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q13 starts the expert tier — three from a crore. ${stakes}`,
    };
  }

  // Late expert tier
  if (cleared === 14) {
    return {
      headline: `One question from a crore, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q15 is the last one. ${stakes}`,
    };
  }
  if (cleared === 13) {
    return {
      headline: `Expert tier, ${name}.`,
      body: `Q13 cleared with ${scoreLabel} credibility points. Two more questions to a crore. ${stakes}`,
    };
  }

  // Generic in-tier (Q1, Q2, Q3, Q6, Q7, Q9, Q11)
  let praise;
  if (cleared <= 3) praise = "Well played";
  else if (cleared <= 7) praise = "Strong work";
  else praise = "Impressive"; // Q9, Q11

  return {
    headline: `${praise}, ${name}.`,
    body: `Q${cleared} cleared with ${scoreLabel} credibility points. ${stakes}`,
  };
}

// Onboarding flow:
//   ONBOARDING (name) → RULES (game explanation) → MODULE_PICK → PLAYING
// Aasif's call (2026-05-09): rules come BEFORE module pick so the player
// knows the contract before committing to a topic. Returning players who
// have already seen the rules (RULES_SEEN_KEY localStorage flag) skip
// from ONBOARDING straight to MODULE_PICK.
const SCREEN_ONBOARDING = "onboarding";
const SCREEN_MODULE_PICK = "module-pick";
const SCREEN_RULES = "rules";
const SCREEN_PLAYING = "playing";

// localStorage key — once the player has seen the rules walkthrough,
// "Start the game" goes straight to the first question on subsequent
// plays. Cleared with localStorage.clear() if the player wants to see
// rules again. Aasif's call (2026-05-09).
const RULES_SEEN_KEY = "policyWonk:rulesSeen";

// sessionStorage key — guest play state (issue #19). Snapshot of
// { screen, name, moduleId, state } persisted on every change so a
// refresh restores the in-progress game. Cleared when the player hits
// "Play again" on the end screen. Tab close wipes it for free
// (sessionStorage semantics) — exactly the ephemerality the issue asks
// for. Logged-in players use the same mechanism; their session also gets
// POSTed to /api/me/sessions at the end for permanent storage.
const GAME_STATE_KEY = "policyWonk:gameState";

function loadPersistedGame() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(GAME_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedGame() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(GAME_STATE_KEY);
  } catch {
    // best-effort
  }
}

// Storied rules — one card per stage, the player clicks Next through
// them. Replaces the all-in-one rules screen.
const RULES_STAGES = [
  {
    title: "The ladder",
    body: "Fifteen questions across four tiers. The timer relaxes as the questions get harder: 15 seconds for easy (Q1–4), 30 for medium (Q5–8), 45 for hard (Q9–12), and 60 for expert (Q13–15).",
  },
  {
    title: "Credibility points",
    body: "Q1 is worth 1,000 credibility points. The ladder climbs to one crore at Q15. A wrong answer drops you to your last safety net.",
  },
  {
    title: "Safety nets",
    body: "There are two safety nets. Clear Q5 and 25,000 credibility points are locked in. Clear Q10 and 10,00,000 are locked in. Past those points, even a wrong answer keeps you at the safety-net amount.",
  },
  {
    title: "Walk away",
    body: "From Q6 onwards (once you've cleared the first safety net), you can walk away with your current credibility instead of risking the next question. The option is locked through Q1–Q5.",
  },
  {
    title: "Lifelines",
    body: "Three lifelines, each usable once per session. 50:50 eliminates two wrong options. Audience Poll shows what the crowd thinks. Ask Your Professor ✨ gets you advice from one of three professors — they'll lecture you a little first, but they always point you to the right answer.",
  },
];

export default function GameContainer() {
  // Read the persisted snapshot once at first render so the rehydrated
  // screen paints immediately (no flash of the onboarding screen).
  // useState initializers run once on mount.
  const [persisted] = useState(loadPersistedGame);
  const [screen, setScreen] = useState(() => persisted?.screen ?? SCREEN_ONBOARDING);
  const [name, setName] = useState(() => persisted?.name ?? "");
  const [moduleId, setModuleId] = useState(
    () => persisted?.moduleId ?? (modules[0]?.id ?? ""),
  );
  const [state, setState] = useState(() => persisted?.state ?? null);
  const [loadError, setLoadError] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [walkAwayConfirm, setWalkAwayConfirm] = useState(false);
  const [rulesStage, setRulesStage] = useState(() => persisted?.rulesStage ?? 0);
  // Logged-in user (or null). Populated by the /api/me effect below. Used
  // to skip the in-game name prompt — a player with an account nickname
  // shouldn't be asked their name again at the start of every game (#32).
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Rung that was mounted from sessionStorage (or null if no rehydrate).
  // Used to tell the Question component to render instantly instead of
  // replaying the typewriter and option fade-in — the player has already
  // read this question, re-typing it on refresh feels broken.
  const rehydratedRungRef = useRef(persisted?.state?.currentRung ?? null);

  // Compute the "next" screen after onboarding completes — RULES the first
  // time, MODULE_PICK on returning. Shared between manual onboarding
  // advance, the auto-skip for logged-in users, and Play again.
  const goPostOnboarding = useCallback(() => {
    const seen =
      typeof window !== "undefined" &&
      window.localStorage?.getItem(RULES_SEEN_KEY) === "true";
    if (seen) {
      setScreen(SCREEN_MODULE_PICK);
    } else {
      setRulesStage(0);
      setScreen(SCREEN_RULES);
    }
  }, []);

  // One-shot auth check on mount. If the player has an account with a
  // nickname, seed it as the in-game name and jump past the name prompt.
  // Guests get a null result and stay on the existing flow. Deps=[] so
  // this runs exactly once per mount — Play again handles its own skip
  // below using the loggedInUser state captured here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const user = data?.user ?? null;
        if (!user) return;
        setLoggedInUser(user);
        // Only auto-advance on a fresh entry — don't disturb a game in
        // progress (state != null) or a player who already moved past
        // onboarding (e.g. mid-rules or mid-module-pick on a refresh).
        if (!user.nickname) return;
        if (state != null) return;
        if (screen !== SCREEN_ONBOARDING) return;
        setName(user.nickname);
        goPostOnboarding();
      } catch {
        // /api/me unreachable — treat as guest. Existing flow continues.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the game snapshot on any change. Skip while a lock is mid-flight
  // (answerLocked=true but correctIndex not yet resolved) — that 1s window
  // owns an async chain inside handleLock that won't re-fire after a refresh,
  // so freezing the persisted snapshot at the pre-lock state lets a refreshed
  // player re-attempt the lock cleanly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const lockInFlight =
      state &&
      state.status === "reveal-question" &&
      state.answerLocked &&
      state.correctIndex == null;
    if (lockInFlight) return;
    try {
      window.sessionStorage?.setItem(
        GAME_STATE_KEY,
        JSON.stringify({ screen, name, moduleId, state, rulesStage }),
      );
    } catch {
      // sessionStorage may be unavailable (private mode, quota). Not blocking
      // — the player can keep playing, just without refresh-survival.
    }
  }, [screen, name, moduleId, state, rulesStage]);

  const currentQuestion = state ? state.plan[state.currentRung - 1] : null;
  const tierTimer = currentQuestion ? timerForRung(state.currentRung, currentQuestion) : 0;

  const trimmedName = name.trim();
  const canContinueFromOnboarding = trimmedName.length > 0;

  const advanceFromOnboarding = useCallback(() => {
    setLoadError(null);
    if (!trimmedName) {
      setLoadError("Enter your name to begin.");
      return;
    }
    goPostOnboarding();
  }, [trimmedName, goPostOnboarding]);

  const startGame = useCallback(async (chosenModuleId) => {
    setLoadError(null);
    try {
      const questionsRes = await fetch(`/data/questions/${chosenModuleId}.json`);
      if (!questionsRes.ok) throw new Error(`questions ${questionsRes.status}`);
      const questionBank = await questionsRes.json();
      const { plan, warnings } = pickSessionQuestions(questionBank);
      if (warnings.length) {
        for (const w of warnings) console.warn("question pool:", w);
      }
      setState(createInitialState({ name: trimmedName, moduleId: chosenModuleId, plan }));
      setScreen(SCREEN_PLAYING);
      // Funnel events (#12) — fire only once the play has actually started
      // (questions loaded, screen switched), so abandoned module picks and
      // failed loads don't count as plays.
      trackEvent("module_chosen", { module: chosenModuleId });
      trackEvent("game_started", { module: chosenModuleId });
    } catch (e) {
      setLoadError(`Failed to load module: ${e.message}`);
    }
  }, [trimmedName]);

  async function fetchExplanation(question) {
    try {
      const res = await fetch(`/data/explanations/${question.module}/${question.id}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.explanation ?? null;
    } catch {
      return null;
    }
  }

  const resetToOnboarding = useCallback(() => {
    // Wipe the persisted snapshot so a refresh from the next onboarding
    // screen doesn't snap them back into the finished game. The persist
    // effect will re-save the fresh empty snapshot on the next render.
    clearPersistedGame();
    setState(null);
    setTimerRunning(false);
    setWalkAwayConfirm(false);
    // Logged-in users (#32): skip the name prompt on Play again. Their
    // nickname is already in `name` from the initial seed, so we jump
    // straight to rules (first time) or module pick (returning).
    if (loggedInUser?.nickname) {
      goPostOnboarding();
    } else {
      setScreen(SCREEN_ONBOARDING);
    }
  }, [loggedInUser, goPostOnboarding]);

  // After options finish revealing, start the timer for this question.
  // Stamp questionStartedAt the first time this fires per rung so a
  // mid-question refresh can compute the right remaining seconds. On
  // rehydrate (instant Question), this also fires immediately — the
  // null-guard preserves the original timestamp.
  const handleRevealComplete = useCallback(() => {
    if (state?.status === "reveal-question") {
      setTimerRunning(true);
      if (state.questionStartedAt == null) {
        setState((s) =>
          s && s.status === "reveal-question" && s.questionStartedAt == null
            ? { ...s, questionStartedAt: Date.now() }
            : s,
        );
      }
    }
  }, [state?.status]);

  const handleSelect = useCallback((i) => {
    setState((s) => selectOption(s, i));
  }, []);

  // Lock + check + reveal flow. 1s suspense pause before reveal so the
  // lock state is felt for a beat (no character to fill the space, but
  // a brief rhythm still helps absorption).
  const handleLock = useCallback(async () => {
    if (!state || state.selectedAnswer == null || state.answerLocked) return;
    setTimerRunning(false);
    setState(lockAnswer(state));
    const q = state.plan[state.currentRung - 1];
    const selectedText = q.options[state.selectedAnswer];
    const [correct, correctIdx, exp] = await Promise.all([
      isCorrect(q, selectedText),
      findCorrectIndex(q),
      fetchExplanation(q),
    ]);
    await new Promise((r) => setTimeout(r, 1000));
    setState((s) => reveal(s, correct, exp, correctIdx));
  }, [state]);

  // For revealed-wrong: end the game.
  // For revealed-correct on Q15: advance triggers the "won" status.
  // For revealed-correct on Q1–Q14: handled by handleContinueToNextRung
  // and handleWalkAwayAfterCorrect; this handler is only used for the
  // Q15 / wrong cases below.
  const handleNext = useCallback(() => {
    if (!state) return;
    if (state.status === "revealed-correct") {
      setState((s) => advanceToNextQuestion(s));
    } else if (state.status === "revealed-wrong") {
      setState((s) => endAfterWrong(s));
    }
  }, [state]);

  const handleContinueToNextRung = useCallback(() => {
    setState((s) => advanceToNextQuestion(s));
  }, []);

  // Walk away after clearing a rung (Q1–Q14). Bypasses canWalkAway()
  // which only allows walk-away on reveal-question; here the player
  // has already cleared the current rung, so the score is well-defined.
  const handleWalkAwayAfterCorrect = useCallback(() => {
    setState((s) => ({
      ...s,
      status: "walked-away",
      score: walkAwayScore(s.highestClearedRung),
    }));
  }, []);

  const handleWalkAway = useCallback(() => {
    if (!state || !canWalkAway(state)) return;
    setTimerRunning(false);
    setWalkAwayConfirm(true);
  }, [state]);

  const confirmWalkAway = useCallback(() => {
    setState((s) => walkAway(s));
    setWalkAwayConfirm(false);
  }, []);

  const cancelWalkAway = useCallback(() => {
    setWalkAwayConfirm(false);
    if (state?.status === "reveal-question") setTimerRunning(true);
  }, [state]);

  const handleLifelineFiftyFifty = useCallback(async () => {
    if (!state || state.status !== "reveal-question" || state.answerLocked) return;
    if (!state.lifelines.fiftyFifty) return;
    const q = state.plan[state.currentRung - 1];
    const correctIdx = await findCorrectIndex(q);
    const eliminated = fiftyFiftyEliminate(correctIdx);
    setState((s) => applyFiftyFifty(s, eliminated));
  }, [state]);

  const handleLifelinePoll = useCallback(async () => {
    if (!state || state.status !== "reveal-question" || state.answerLocked) return;
    if (!state.lifelines.poll) return;
    setTimerRunning(false);
    const q = state.plan[state.currentRung - 1];
    const correctIdx = await findCorrectIndex(q);
    const pollData = generateAudiencePoll(correctIdx, q.difficulty);
    setState((s) => applyAudiencePoll(s, pollData));
  }, [state]);

  const handleLifelineExpert = useCallback(async (expertId) => {
    if (!state || state.status !== "reveal-question" || state.answerLocked) return;
    if (!state.lifelines.expert) return;
    setTimerRunning(false);
    const expert = EXPERTS.find((e) => e.id === expertId);
    if (!expert) return;
    const q = state.plan[state.currentRung - 1];
    const correctIdx = await findCorrectIndex(q);
    const verdict = expertVerdict(expert, correctIdx);
    const tag = verdict.gotItRight ? "correct" : "wrong";
    const optionLetter = ["A", "B", "C", "D"][verdict.pickedIndex];
    const aiLine = pickExpertLine(EXPERTS, expertId, tag, {
      option: `Option ${optionLetter}`,
    });
    setState((s) => applyExpert(s, expertId, aiLine?.text ?? null, verdict.pickedIndex));
  }, [state]);

  const handleLifelineDismiss = useCallback(() => {
    if (state?.status === "reveal-question" && !state.answerLocked) {
      setTimerRunning(true);
    }
  }, [state]);

  const handleExpire = useCallback(async () => {
    setTimerRunning(false);
    const q = state?.plan[state.currentRung - 1];
    setState((s) => timeExpired(s));
    if (q) {
      const [exp, correctIdx] = await Promise.all([
        fetchExplanation(q),
        findCorrectIndex(q),
      ]);
      setState((s) => ({ ...s, explanation: exp, correctIndex: correctIdx }));
    }
  }, [state]);

  // Keyboard: 1-4 select, Enter lock, W walk away
  useEffect(() => {
    if (screen !== SCREEN_PLAYING || !state) return;
    if (state.status !== "reveal-question") return;
    function onKey(e) {
      if (e.key >= "1" && e.key <= "4") {
        const i = Number(e.key) - 1;
        if (!state.fiftyFiftyEliminated.includes(i)) handleSelect(i);
      } else if (e.key === "Enter") {
        handleLock();
      } else if (e.key === "w" || e.key === "W") {
        handleWalkAway();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, state, handleSelect, handleLock, handleWalkAway]);

  if (screen === SCREEN_ONBOARDING) {
    return (
      <section className="max-w-xl mx-auto min-h-[70vh] flex flex-col justify-center gap-10">
        <header className="flex flex-col items-center gap-5 text-center">
          <span className="text-xs uppercase tracking-[0.2em] px-3 py-1 border border-[var(--color-border-soft)] text-[var(--color-text-soft)]">
            Step 1 of 3
          </span>
          <h1 className="font-serif text-5xl md:text-6xl font-semibold leading-tight">
            Who is playing<span className="text-[var(--color-functional-marigold)] italic">?</span>
          </h1>
        </header>

        <label className="flex flex-col gap-2 max-w-md w-full mx-auto">
          <span className="text-sm opacity-80 text-center">
            Your name <span className="opacity-60">(required)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canContinueFromOnboarding) {
                advanceFromOnboarding();
              }
            }}
            maxLength={30}
            required
            autoFocus
            aria-required="true"
            className="px-4 py-3 text-lg text-center rounded bg-[var(--color-bg-soft)] border-2 border-[var(--color-border)] text-[var(--color-text)] focus:border-[var(--color-functional-marigold)] focus:outline-none focus:ring-2 focus:ring-[var(--color-functional-marigold)]/30"
          />
        </label>

        {loadError && (
          <p className="text-[var(--color-functional-red)] text-sm text-center">{loadError}</p>
        )}

        <button
          type="button"
          onClick={advanceFromOnboarding}
          disabled={!canContinueFromOnboarding}
          className="self-center px-8 py-3 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          Continue →
        </button>
      </section>
    );
  }

  if (screen === SCREEN_MODULE_PICK) {
    return (
      <section className="max-w-xl mx-auto min-h-[70vh] flex flex-col justify-center gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="text-xs uppercase tracking-[0.2em] px-3 py-1 border border-[var(--color-border-soft)] text-[var(--color-text-soft)]">
            Step 3 of 3
          </span>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">
            Pick your module
          </h1>
          <p className="text-sm text-[var(--color-text-soft)]">All fifteen questions come from the one you choose.</p>
        </header>

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Module</legend>
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModuleId(m.id)}
                className={`px-3 py-2 rounded border text-sm text-left ${
                  moduleId === m.id
                    ? "border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/15"
                    : "border-[var(--color-border)] hover:border-[var(--color-functional-marigold)]/60"
                }`}
              >
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {loadError && (
          <p className="text-[var(--color-functional-red)] text-sm">{loadError}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              // Back goes to rules if first-timer (so they can re-read);
              // otherwise straight back to onboarding (rules were skipped).
              const seen =
                typeof window !== "undefined" &&
                window.localStorage?.getItem(RULES_SEEN_KEY) === "true";
              if (seen) {
                setScreen(SCREEN_ONBOARDING);
              } else {
                setRulesStage(RULES_STAGES.length - 1);
                setScreen(SCREEN_RULES);
              }
            }}
            className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-soft)]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (!moduleId) return;
              startGame(moduleId);
            }}
            disabled={!moduleId}
            className="px-5 py-2 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            Start the game
          </button>
        </div>
      </section>
    );
  }

  if (screen === SCREEN_RULES) {
    const stage = RULES_STAGES[rulesStage];
    const isLastStage = rulesStage === RULES_STAGES.length - 1;
    const advanceToModulePick = () => {
      try {
        window.localStorage?.setItem(RULES_SEEN_KEY, "true");
      } catch {
        // localStorage may be unavailable (private browsing, etc.) —
        // not blocking. Player just sees rules again next time.
      }
      setScreen(SCREEN_MODULE_PICK);
    };
    const goBack = () => {
      if (rulesStage === 0) {
        setScreen(SCREEN_ONBOARDING);
      } else {
        setRulesStage(rulesStage - 1);
      }
    };
    return (
      <section className="max-w-2xl mx-auto min-h-[80vh] flex flex-col justify-center gap-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="text-xs uppercase tracking-[0.2em] px-3 py-1 border border-[var(--color-border-soft)] text-[var(--color-text-soft)]">
            Step 2 of 3
          </span>
          <p className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            How it works · {rulesStage + 1} of {RULES_STAGES.length}
          </p>
          <h1 className="font-serif text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            {stage.title}
          </h1>
        </header>

        <p className="text-lg md:text-xl leading-relaxed text-center text-[var(--color-text-soft)] max-w-xl mx-auto">
          {stage.body}
        </p>

        {/* Progress dots — quiet visual cue of how many stages remain. */}
        <div className="flex justify-center gap-2" aria-hidden="true">
          {RULES_STAGES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === rulesStage
                  ? "w-6 bg-[var(--color-functional-marigold)]"
                  : i < rulesStage
                  ? "w-1.5 bg-[var(--color-functional-marigold)]/40"
                  : "w-1.5 bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>

        {loadError && (
          <p className="text-[var(--color-functional-red)] text-sm text-center">{loadError}</p>
        )}

        <div className="flex flex-col items-center gap-4">
          {isLastStage ? (
            <button
              type="button"
              onClick={advanceToModulePick}
              className="px-12 py-5 bg-[var(--color-charcoal)] text-[var(--color-bg)] text-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Pick your module →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRulesStage(rulesStage + 1)}
              className="px-12 py-5 bg-[var(--color-charcoal)] text-[var(--color-bg)] text-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Next →
            </button>
          )}
          <div className="flex gap-5 items-center text-sm">
            <button
              type="button"
              onClick={goBack}
              className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={advanceToModulePick}
              className="text-xs underline text-[var(--color-text-muted)] hover:text-[var(--color-text-soft)]"
            >
              Skip the rules
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!state) return null;

  if (state.status === "won" || state.status === "lost" || state.status === "walked-away") {
    return <EndScreen state={state} onPlayAgain={resetToOnboarding} />;
  }

  const lockEnabled =
    state.selectedAnswer != null && !state.answerLocked && state.status === "reveal-question";

  const inReveal =
    state.status === "revealed-correct" || state.status === "revealed-wrong";

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="grid md:grid-cols-[1fr_240px] gap-6 w-full">
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm opacity-70">
            Question {state.currentRung} of 15 — {LADDER[state.currentRung - 1].difficulty}
          </p>
          {state.status === "reveal-question" && (
            <Timer
              seconds={tierTimer}
              running={timerRunning}
              initialElapsedSec={
                state.questionStartedAt != null
                  ? (Date.now() - state.questionStartedAt) / 1000
                  : 0
              }
              onExpire={handleExpire}
            />
          )}
        </div>

        <Question
          question={currentQuestion}
          selectedIndex={state.selectedAnswer}
          locked={state.answerLocked}
          eliminated={state.fiftyFiftyEliminated}
          revealCorrect={inReveal ? state.correctIndex : null}
          instant={rehydratedRungRef.current === state.currentRung}
          onSelect={handleSelect}
          onRevealComplete={handleRevealComplete}
        />

        {inReveal && (() => {
          const isCorrect = state.status === "revealed-correct";
          const cleared = state.currentRung;
          const isLastRung = cleared >= 15;
          const scoreLabel = formatIndianNumber(state.score);
          const msg =
            isCorrect && !isLastRung
              ? rungMessage(cleared, scoreLabel, state.playerName)
              : null;
          return (
            <div
              className={`border-2 rounded-lg p-5 flex flex-col gap-4 ${
                isCorrect
                  ? "border-[var(--color-functional-green)] bg-[var(--color-functional-green)]/8"
                  : "border-[var(--color-functional-red)] bg-[var(--color-functional-red)]/8"
              }`}
            >
              <p className="text-xs uppercase tracking-widest opacity-70">
                {isCorrect ? "Correct" : "Incorrect"}
              </p>
              {state.explanation && (
                <p className="leading-relaxed text-[var(--color-text)]">
                  {state.explanation}
                </p>
              )}

              {msg && (
                <div className="border-t border-[var(--color-border)] pt-4 flex flex-col gap-3">
                  <p className="text-sm">
                    <strong>{msg.headline}</strong> {msg.body}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleContinueToNextRung}
                      className="px-5 py-2 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
                    >
                      Continue to Q{cleared + 1}
                    </button>
                    {/* Walk-away in inter-rung appears only when going into a
                        walk-away-eligible rung (Q6+). Cleared 5 means the
                        next rung is 6, the first walkable one. */}
                    {cleared >= 5 && (
                      <button
                        type="button"
                        onClick={handleWalkAwayAfterCorrect}
                        className="px-5 py-2 rounded border border-[var(--color-charcoal)] text-[var(--color-charcoal)] font-semibold hover:bg-[var(--color-charcoal)]/10"
                      >
                        Walk away with {scoreLabel}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(!isCorrect || isLastRung) && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="self-start px-5 py-2 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
                >
                  See result
                </button>
              )}

              <div className="border-t border-[var(--color-border)] pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                <span>Spot an issue with this question?</span>
                <a
                  href={`mailto:aasif@aasifj.com?subject=${encodeURIComponent(`[Policy Wonk] Issue with ${currentQuestion.id}`)}&body=${encodeURIComponent(`Module: ${currentQuestion.module}\nQuestion ID: ${currentQuestion.id}\n\nWhat's wrong:\n`)}`}
                  className="underline hover:opacity-70"
                >
                  Email
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={`https://github.com/criatvt/policy-wonk-game/issues/new?title=${encodeURIComponent(`[Question issue] ${currentQuestion.id}`)}&body=${encodeURIComponent(`**Module:** ${currentQuestion.module}\n**Question ID:** ${currentQuestion.id}\n\n**What's wrong:**\n`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-70"
                >
                  GitHub issue
                </a>
              </div>
            </div>
          );
        })()}

        {state.status === "reveal-question" && !walkAwayConfirm && (
          <Lifelines
            state={state}
            experts={EXPERTS}
            onUseFiftyFifty={handleLifelineFiftyFifty}
            onUseAudiencePoll={handleLifelinePoll}
            onUseExpert={handleLifelineExpert}
            onDismissPanel={handleLifelineDismiss}
          />
        )}

        {state.status === "reveal-question" && !walkAwayConfirm && (
          <div className="flex flex-wrap gap-3 mt-2">
            <button
              type="button"
              disabled={!lockEnabled}
              onClick={handleLock}
              className="px-5 py-2 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold disabled:opacity-30 hover:opacity-90"
            >
              Lock answer
            </button>
            <div className="ml-auto flex flex-col items-end gap-0.5">
              <button
                type="button"
                disabled={!canWalkAway(state)}
                onClick={handleWalkAway}
                className="px-3 py-2 text-xs opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Walk away
              </button>
              {state.currentRung <= 5 && (
                <span className="text-[10px] opacity-50">
                  Unlocks at Q6 (after the first safety net)
                </span>
              )}
            </div>
          </div>
        )}

        {walkAwayConfirm && (
          <div className="border border-[var(--color-border-soft)] bg-[var(--color-bg-panel)] rounded-lg p-4 flex flex-col gap-3">
            <p className="text-base">
              Walk away with{" "}
              <span className="font-semibold">
                {formatIndianNumber(walkAwayScore(state.highestClearedRung))}
              </span>{" "}
              credibility points?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelWalkAway}
                className="px-4 py-2 rounded border border-[var(--color-border-soft)] text-[var(--color-text)] hover:border-[var(--color-text-soft)]"
              >
                Stay in the game
              </button>
              <button
                type="button"
                onClick={confirmWalkAway}
                className="px-4 py-2 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
              >
                Yes, walk away
              </button>
            </div>
          </div>
        )}
      </section>

      <aside className="md:order-2">
        <p className="text-xs uppercase tracking-widest opacity-60 mb-2">Ladder</p>
        <Ladder
          currentRung={state.currentRung}
          highestClearedRung={state.highestClearedRung}
        />
      </aside>
      </div>
    </div>
  );
}
