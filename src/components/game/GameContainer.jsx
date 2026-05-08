import { useCallback, useEffect, useMemo, useState } from "react";
import modules from "../../data/modules.json";
import {
  LADDER,
  advanceToNextQuestion,
  applyAudiencePoll,
  applyExpert,
  applyFiftyFifty,
  canWalkAway,
  createInitialState,
  endAfterWrong,
  lockAnswer,
  pickSessionQuestions,
  reveal,
  selectOption,
  timeExpired,
  timerForRung,
  walkAway,
} from "../../lib/gameEngine.js";
import {
  expertVerdict,
  fiftyFiftyEliminate,
  generateAudiencePoll,
} from "../../lib/lifelineLogic.js";
import { findCorrectIndex, isCorrect } from "../../lib/answerHash.js";
import {
  pickCorrectLine,
  pickExpertLine,
  pickLine,
  pickModuleIntro,
  pickTierIntro,
  pickWrongLine,
} from "../../lib/dialoguePicker.js";
import expertsData from "../../data/experts.json";
import Question from "./Question.jsx";
import Ladder from "./Ladder.jsx";
import Timer from "./Timer.jsx";
import IqbalJi from "./IqbalJi.jsx";
import EndScreen from "./EndScreen.jsx";
import Lifelines from "./Lifelines.jsx";
import HostTakeover from "./HostTakeover.jsx";

const EXPERTS = expertsData.experts;

// Onboarding flow:
//   ONBOARDING → WELCOME (Iqbal Ji) → MODULE_PICK → PLAYING
// Per Aasif's flow call: name + language captured first, then Iqbal Ji
// welcomes the player, then they pick a module, then the quiz begins.
const SCREEN_ONBOARDING = "onboarding";
const SCREEN_WELCOME = "welcome";
const SCREEN_MODULE_PICK = "module-pick";
const SCREEN_PLAYING = "playing";

function slugifyGroup(group) {
  return group
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Group modules for the picker, preserving spec order.
function groupedModules() {
  const groups = ["Foundations", "Economic Reasoning", "Strategy & Society"];
  return groups.map((g) => ({
    group: g,
    items: modules.filter((m) => m.group === g),
  }));
}

// Neutral system text only. Phase 7 wires the dialogue picker against
// the approved lines in 07-dialogue-script.md. Do NOT write character
// voice here — that violates CLAUDE.md.
function statusText(state) {
  if (!state) return "";
  if (state.status === "reveal-question") return `Question ${state.currentRung} of 15.`;
  if (state.status === "locked") return "Answer locked. Awaiting reveal.";
  if (state.status === "revealed-correct") return "Correct.";
  if (state.status === "revealed-wrong") return "Incorrect.";
  return "";
}

// Welcome screen — Iqbal Ji takeover with the welcome beat. Picked
// once on mount so the line doesn't reroll if the player navigates
// back from the module-pick screen.
function WelcomeScreen({ playerName, onContinue }) {
  const [line] = useState(() =>
    pickLine("welcome", { name: playerName }) ?? null,
  );
  if (!line) {
    return (
      <section className="text-center max-w-xl mx-auto py-12">
        <p className="text-base">Welcome.</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 px-6 py-3 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold"
        >
          Continue
        </button>
      </section>
    );
  }
  return (
    <HostTakeover
      expression={line.expression}
      tone="neutral"
      caption="Welcome to the studio."
      body={line.text}
      onContinue={onContinue}
      continueLabel="Pick a module"
    />
  );
}

function expressionFor(state) {
  if (!state) return "neutral";
  if (state.status === "revealed-correct") return "smiling";
  if (state.status === "revealed-wrong") return "sad";
  if (state.status === "won") return "smiling";
  if (state.status === "lost") return "sad";
  return "neutral";
}

export default function GameContainer() {
  const [screen, setScreen] = useState(SCREEN_ONBOARDING);
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "");
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [takeoverShown, setTakeoverShown] = useState(false);
  // Interstitial: a HostTakeover panel queued in front of normal play
  // (welcome, module intro, tier intro, fourth-wall beat, safety-net,
  // end-screen). Shape: { line, tone, caption, continueLabel, after }.
  const [interstitial, setInterstitial] = useState(null);
  // Cached reveal lines so they don't reroll on each render.
  const [revealLine, setRevealLine] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [explanationVisible, setExplanationVisible] = useState(false);

  const grouped = useMemo(groupedModules, []);

  const currentQuestion = state ? state.plan[state.currentRung - 1] : null;
  const tierTimer = currentQuestion ? timerForRung(state.currentRung, currentQuestion) : 0;

  const trimmedName = name.trim();
  const canContinueFromOnboarding = trimmedName.length > 0;

  // Step 1 → 2: name + language captured, advance to Iqbal Ji's welcome.
  const advanceFromOnboarding = useCallback(() => {
    setLoadError(null);
    if (!trimmedName) {
      setLoadError("Enter your name to begin.");
      return;
    }
    setScreen(SCREEN_WELCOME);
  }, [trimmedName]);

  // Step 3: load bank, build session plan, start the quiz at Q1.
  // Module-intro dialogue is currently group-based (Foundations / Economic
  // Reasoning / Strategy & Society) but the player picks a per-course
  // module — group dialogue would mis-name the choice. Skip module-intro
  // until per-module lines are written. Aasif: see project memory.
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
      setExplanationVisible(false);
      setScreen(SCREEN_PLAYING);
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

  // Reset to onboarding for "play again"
  const resetToOnboarding = useCallback(() => {
    setState(null);
    setExplanationVisible(false);
    setTakeoverShown(false);
    setInterstitial(null);
    setRevealLine(null);
    setTimerRunning(false);
    setScreen(SCREEN_ONBOARDING);
  }, []);

  // Helper: queue an interstitial takeover. `beat` is a dialogue.json
  // beat name; subs are runtime substitutions; `after` runs when the
  // user clicks Continue on the takeover panel.
  function queueBeat(beat, subs, opts) {
    const line = pickLine(beat, subs);
    if (!line) {
      opts?.after?.();
      return;
    }
    setInterstitial({
      line,
      caption: opts?.caption ?? null,
      continueLabel: opts?.continueLabel ?? "Continue",
      tone: opts?.tone ?? "neutral",
      after: opts?.after,
    });
  }
  function dismissInterstitial() {
    const after = interstitial?.after;
    setInterstitial(null);
    after?.();
  }

  // After reveal, hold the green/red highlight on the question for a
  // beat so the player sees the right answer; THEN bring the host
  // takeover forward with the explanation.
  useEffect(() => {
    if (state?.status !== "revealed-correct" && state?.status !== "revealed-wrong") {
      setTakeoverShown(false);
      return;
    }
    const t = setTimeout(() => setTakeoverShown(true), 4000);
    return () => clearTimeout(t);
  }, [state?.status, state?.currentRung]);

  // After options finish revealing, start the timer for this question
  const handleRevealComplete = useCallback(() => {
    if (state?.status === "reveal-question") {
      setTimerRunning(true);
    }
  }, [state?.status]);

  const handleSelect = useCallback(
    (i) => {
      setState((s) => selectOption(s, i));
    },
    [],
  );

  // Lock + check + reveal flow
  const handleLock = useCallback(async () => {
    if (!state || state.selectedAnswer == null || state.answerLocked) return;
    setTimerRunning(false);
    const localLocked = lockAnswer(state);
    setState(localLocked);
    const q = state.plan[state.currentRung - 1];
    const selectedText = q.options[state.selectedAnswer];
    const [correct, correctIdx, exp] = await Promise.all([
      isCorrect(q, selectedText),
      findCorrectIndex(q),
      fetchExplanation(q),
    ]);
    // Suspense pause before reveal. 3s is the dramatic-host beat — long
    // enough to feel like real anticipation, short enough to not bore.
    await new Promise((r) => setTimeout(r, 3000));
    // Cache the dialogue line for the reveal takeover so it doesn't
    // reroll on every render.
    const correctText = q.options[correctIdx];
    const subs = {
      name: state.playerName,
      option: `Option ${["A", "B", "C", "D"][state.selectedAnswer]}`,
      correct: correctText,
    };
    const line = correct
      ? pickCorrectLine(q.difficulty, subs)
      : pickWrongLine(q.difficulty, subs);
    setRevealLine(line);

    // Fourth-wall beat fires post-lock pre-reveal at Q9 (cheating) and
    // Q13 (ethics). Once per session each. Audience mode visual.
    const doReveal = () => {
      setState((s) => reveal(s, correct, exp, correctIdx));
      setExplanationVisible(true);
    };
    const rung = state.currentRung;
    const fwBeat =
      rung === 9 && !state.fourthWallFiredQ9
        ? "tier-3-fourth-wall-cheating"
        : rung === 13 && !state.fourthWallFiredQ13
        ? "tier-4-ethics-aside"
        : null;
    if (fwBeat) {
      const fwLine = pickLine(fwBeat, { name: state.playerName });
      if (fwLine) {
        setInterstitial({
          line: fwLine,
          caption: rung === 9 ? "Aside, to the audience." : "A reflection.",
          continueLabel: "Reveal the answer",
          tone: "neutral",
          audienceMode: true,
          after: () => {
            setState((s) => ({
              ...s,
              ...(rung === 9 ? { fourthWallFiredQ9: true } : {}),
              ...(rung === 13 ? { fourthWallFiredQ13: true } : {}),
            }));
            doReveal();
          },
        });
        return;
      }
    }
    doReveal();
  }, [state]);

  // Auto-advance after correct, or end after wrong, on user click.
  // Insert safety-net celebration + tier-intro interstitials at the
  // appropriate ladder boundaries.
  const handleNext = useCallback(() => {
    setExplanationVisible(false);
    setRevealLine(null);
    if (!state) return;
    const subs = { name: state.playerName };
    if (state.status === "revealed-correct") {
      const justCleared = state.currentRung;
      const advance = () => setState((s) => advanceToNextQuestion(s));
      // Helper: optionally chain a tier-intro for the next rung
      // (medium-tier-onwards prominence per project memory).
      const queueTierIntroIfNeeded = () => {
        const nextRung = justCleared + 1;
        const tierIntroByRung = { 5: 2, 9: 3, 13: 4 };
        const nextTier = tierIntroByRung[nextRung];
        if (nextTier) {
          // Advance state first so the tier intro fires "for" the next rung
          advance();
          const intro = pickTierIntro(nextTier, subs);
          if (intro) {
            setInterstitial({
              line: intro,
              caption: `Tier ${nextTier}.`,
              continueLabel: "Begin",
              tone: "neutral",
            });
          }
        } else {
          advance();
        }
      };
      // Safety net beats fire after clearing Q5 or Q10.
      if (justCleared === 5 || justCleared === 10) {
        const beat = justCleared === 5 ? "safety-net-q5" : "safety-net-q10";
        queueBeat(beat, subs, {
          continueLabel: "Onwards",
          tone: "correct",
          after: queueTierIntroIfNeeded,
        });
      } else {
        queueTierIntroIfNeeded();
      }
    } else if (state.status === "revealed-wrong") {
      setState((s) => endAfterWrong(s));
    }
  }, [state]);

  const handleWalkAway = useCallback(() => {
    if (!state || !canWalkAway(state)) return;
    setTimerRunning(false);
    const tentativeScore = state.highestClearedRung > 0
      ? LADDER[state.highestClearedRung - 1].credibility
      : 0;
    const subs = {
      name: state.playerName,
      x: tentativeScore.toLocaleString("en-IN"),
    };
    const line = pickLine("walk-away-confirm", subs);
    setInterstitial({
      line: line ?? { text: `Walk away with current safety-net points, ${state.playerName}?`, expression: "neutral" },
      caption: "Walk away?",
      continueLabel: "Yes, walk away",
      tone: "neutral",
      after: () => {
        setState((s) => walkAway(s));
      },
      onCancel: () => {
        setInterstitial(null);
        // Resume timer if we were mid-question
        if (state.status === "reveal-question") setTimerRunning(true);
      },
      cancelLabel: "Stay in the game",
    });
  }, [state]);

  // Lifelines. Each pauses the timer, computes the result, and stamps
  // it onto state via the engine helpers. The lifeline panel close
  // button resumes the timer. Iqbal Ji speaks an intro line for each.
  const handleLifelineFiftyFifty = useCallback(async () => {
    if (!state || state.status !== "reveal-question" || state.answerLocked) return;
    if (!state.lifelines.fiftyFifty) return;
    setTimerRunning(false);
    const q = state.plan[state.currentRung - 1];
    const correctIdx = await findCorrectIndex(q);
    const eliminated = fiftyFiftyEliminate(correctIdx);
    setState((s) => applyFiftyFifty(s, eliminated));
    // Brief Iqbal Ji line + Continue, then resume timer.
    const intro = pickLine("lifeline-fifty-fifty", { name: state.playerName });
    if (intro) {
      setInterstitial({
        line: intro,
        caption: "Fifty-fifty.",
        continueLabel: "Back to the question",
        tone: "neutral",
        after: () => setTimerRunning(true),
      });
    } else {
      setTimeout(() => setTimerRunning(true), 800);
    }
  }, [state]);

  const handleLifelinePoll = useCallback(async () => {
    if (!state || state.status !== "reveal-question" || state.answerLocked) return;
    if (!state.lifelines.poll) return;
    setTimerRunning(false);
    const q = state.plan[state.currentRung - 1];
    const correctIdx = await findCorrectIndex(q);
    const pollData = generateAudiencePoll(correctIdx, q.difficulty);
    const intro = pickLine("lifeline-audience-poll", { name: state.playerName });
    setState((s) => ({
      ...applyAudiencePoll(s, pollData),
      pollIntroLine: intro?.text ?? null,
    }));
  }, [state]);

  const handleLifelineExpert = useCallback(
    async (expertId) => {
      if (!state || state.status !== "reveal-question" || state.answerLocked) return;
      if (!state.lifelines.expert) return;
      setTimerRunning(false);
      const expert = EXPERTS.find((e) => e.id === expertId);
      if (!expert) return;
      const q = state.plan[state.currentRung - 1];
      const correctIdx = await findCorrectIndex(q);
      const verdict = expertVerdict(expert, correctIdx);
      // Pick the AI line based on whether the verdict is right or
      // wrong. Niteen has no "wrong" pool; the picker falls back to
      // "useless" for him.
      const tag = verdict.gotItRight ? "correct" : "wrong";
      const optionLetter = ["A", "B", "C", "D"][verdict.pickedIndex];
      const aiLine = pickExpertLine(EXPERTS, expertId, tag, {
        option: `Option ${optionLetter}`,
      });
      // Iqbal Ji's intro before handing over to the expert.
      const introBeat = `phone-an-ai-intro-${expertId}`;
      const iqbalIntro = pickLine(introBeat, { name: state.playerName });
      setState((s) =>
        applyExpert(s, expertId, aiLine?.text ?? null, verdict.pickedIndex),
      );
      // Cache Iqbal Ji's intro line on state so Lifelines.jsx can show
      // it above the expert verdict.
      setState((s) => ({
        ...s,
        expertVerdict: {
          ...s.expertVerdict,
          iqbalIntro: iqbalIntro?.text ?? null,
        },
      }));
    },
    [state],
  );

  const handleLifelineDismiss = useCallback(() => {
    if (state?.status === "reveal-question" && !state.answerLocked) {
      setTimerRunning(true);
    }
  }, [state]);

  // Iqbal Ji's "Phone an AI" select intro shown when the expert picker
  // opens — passed through to Lifelines.jsx via state.
  const phoneAnAiSelectLine = useMemo(() => {
    if (!state || state.status !== "reveal-question") return null;
    const l = pickLine("phone-an-ai-select", { name: state.playerName });
    return l?.text ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentRung, state?.playerName]);

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
      setExplanationVisible(true);
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
      <section className="max-w-xl mx-auto flex flex-col gap-6">
        <header className="text-center">
          <p className="text-sm uppercase tracking-widest opacity-70">First, the basics</p>
          <h1 className="text-3xl md:text-4xl font-semibold mt-2">Who is playing?</h1>
        </header>

        <label className="flex flex-col gap-2">
          <span className="text-sm opacity-80">
            Your name <span className="opacity-60">(required)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            aria-required="true"
            className="px-3 py-2 rounded bg-[var(--color-bg-soft)] border border-[var(--color-border)] text-[var(--color-text)]"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm opacity-80">Language</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              className="px-3 py-2 rounded border border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/15"
            >
              Strictly English
            </button>
            <button
              type="button"
              disabled
              className="px-3 py-2 rounded border border-[var(--color-border)] opacity-50 cursor-not-allowed"
              title="Coming soon"
            >
              Indian — coming soon
            </button>
            <button
              type="button"
              disabled
              className="px-3 py-2 rounded border border-[var(--color-border)] opacity-50 cursor-not-allowed"
              title="Coming soon"
            >
              Bengaluru Special — coming soon
            </button>
          </div>
        </fieldset>

        {loadError && (
          <p className="text-[var(--color-functional-red)] text-sm">{loadError}</p>
        )}

        <button
          type="button"
          onClick={advanceFromOnboarding}
          disabled={!canContinueFromOnboarding}
          className="px-6 py-3 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </section>
    );
  }

  if (screen === SCREEN_WELCOME) {
    return (
      <WelcomeScreen
        playerName={trimmedName}
        onContinue={() => setScreen(SCREEN_MODULE_PICK)}
      />
    );
  }

  if (screen === SCREEN_MODULE_PICK) {
    return (
      <section className="max-w-xl mx-auto flex flex-col gap-6">
        <header className="text-center">
          <p className="text-sm uppercase tracking-widest opacity-70">Pick your module</p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2">
            All fifteen questions come from this module.
          </h1>
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
                <span className="font-mono opacity-70">{m.code}</span>
                <span className="ml-2">{m.name}</span>
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
            onClick={() => setScreen(SCREEN_WELCOME)}
            className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-soft)]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => startGame(moduleId)}
            disabled={!moduleId}
            className="px-6 py-3 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex-1"
          >
            Start the show
          </button>
        </div>
      </section>
    );
  }

  if (!state) return null;

  // Interstitial takes precedence over normal play. Used for welcome,
  // module intro, tier intros, safety net, fourth-wall asides,
  // walk-away confirm.
  if (interstitial) {
    return (
      <HostTakeover
        expression={interstitial.line.expression}
        tone={interstitial.tone}
        audienceMode={interstitial.line.audienceMode || interstitial.audienceMode}
        caption={interstitial.caption ?? undefined}
        body={interstitial.line.text}
        onContinue={dismissInterstitial}
        continueLabel={interstitial.continueLabel}
        onCancel={interstitial.onCancel}
        cancelLabel={interstitial.cancelLabel}
      />
    );
  }

  if (state.status === "won" || state.status === "lost" || state.status === "walked-away") {
    return <EndScreen state={state} onPlayAgain={resetToOnboarding} />;
  }

  const lockEnabled =
    state.selectedAnswer != null && !state.answerLocked && state.status === "reveal-question";

  // Reveal flow:
  //   reveal-question → locked (1.5s suspense) → revealed-* (2.5s with
  //   green/red highlight on the question itself) → host takeover with
  //   the explanation.
  const inReveal =
    state.status === "revealed-correct" || state.status === "revealed-wrong";
  const showTakeover = inReveal && takeoverShown;

  return (
    <div className="grid md:grid-cols-[1fr_240px] gap-6">
      <section className="flex flex-col gap-5">
        {!showTakeover && (
          <IqbalJi expression={expressionFor(state)} line={statusText(state)} />
        )}

        {!showTakeover && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm opacity-70">
              Question {state.currentRung} of 15 — {LADDER[state.currentRung - 1].difficulty}
            </p>
            {state.status === "reveal-question" && (
              <Timer
                seconds={tierTimer}
                running={timerRunning}
                onExpire={handleExpire}
              />
            )}
          </div>
        )}

        {showTakeover ? (
          <HostTakeover
            expression={revealLine?.expression ?? expressionFor(state)}
            tone={state.status === "revealed-correct" ? "correct" : "wrong"}
            caption={
              state.status === "revealed-correct"
                ? `Correct. Question ${state.currentRung}.`
                : `Incorrect. Question ${state.currentRung}.`
            }
            body={revealLine?.text ?? (state.status === "revealed-correct" ? "Correct." : "Incorrect.")}
            explanation={state.explanation}
            onContinue={handleNext}
            continueLabel={
              state.status === "revealed-correct" ? "Next question" : "See result"
            }
          />
        ) : (
          <Question
            question={currentQuestion}
            selectedIndex={state.selectedAnswer}
            locked={state.answerLocked}
            eliminated={state.fiftyFiftyEliminated}
            revealCorrect={inReveal ? state.correctIndex : null}
            onSelect={handleSelect}
            onRevealComplete={handleRevealComplete}
          />
        )}

        {!showTakeover && state.status === "reveal-question" && (
          <Lifelines
            state={state}
            experts={EXPERTS}
            phoneAnAiSelectLine={phoneAnAiSelectLine}
            onUseFiftyFifty={handleLifelineFiftyFifty}
            onUseAudiencePoll={handleLifelinePoll}
            onUseExpert={handleLifelineExpert}
            onDismissPanel={handleLifelineDismiss}
          />
        )}

        {!showTakeover && (
          <div className="flex flex-wrap gap-3 mt-2">
            {state.status === "reveal-question" && (
              <>
                <button
                  type="button"
                  disabled={!lockEnabled}
                  onClick={handleLock}
                  className="px-5 py-2 rounded border border-[var(--color-functional-marigold)] text-[var(--color-functional-marigold)] disabled:opacity-30"
                >
                  Lock answer
                </button>
                <button
                  type="button"
                  disabled={!canWalkAway(state)}
                  onClick={handleWalkAway}
                  className="ml-auto px-3 py-2 text-xs opacity-70 hover:opacity-100 disabled:opacity-30"
                >
                  Walk away
                </button>
              </>
            )}
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
  );
}

