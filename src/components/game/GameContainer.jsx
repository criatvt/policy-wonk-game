import { useCallback, useEffect, useMemo, useState } from "react";
import modules from "../../data/modules.json";
import {
  LADDER,
  advanceToNextQuestion,
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
import { findCorrectIndex, isCorrect } from "../../lib/answerHash.js";
import Question from "./Question.jsx";
import Ladder from "./Ladder.jsx";
import Timer from "./Timer.jsx";
import IqbalJi from "./IqbalJi.jsx";
import EndScreen from "./EndScreen.jsx";

const SCREEN_ONBOARDING = "onboarding";
const SCREEN_PLAYING = "playing";

// Group modules for the picker, preserving spec order.
function groupedModules() {
  const groups = ["Foundations", "Economic Reasoning", "Strategy & Society"];
  return groups.map((g) => ({
    group: g,
    items: modules.filter((m) => m.group === g),
  }));
}

// Placeholder dialogue beats — Phase 7 replaces with the dialogue picker.
function beatLine(state) {
  if (!state) return "";
  if (state.status === "reveal-question") {
    if (state.currentRung === 1) return "First question. Standard Operating Procedure: read carefully.";
    if (state.currentRung === 5) return "First safety net is right here. Cross it and you don't go home empty-handed.";
    if (state.currentRung === 10) return "Second safety net. Now things get interesting.";
    if (state.currentRung === 13) return "Tier four. The Reserve Bank of difficulty.";
    return `Question ${state.currentRung}. Take your time, the timer's only counting.`;
  }
  if (state.status === "locked") return "Locked. Now the suspense.";
  if (state.status === "revealed-correct") return "Correct! Onwards.";
  if (state.status === "revealed-wrong") return "Hmm. Not quite. Look again — and look at the explanation.";
  return "";
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
  const [timerRunning, setTimerRunning] = useState(false);
  const [explanationVisible, setExplanationVisible] = useState(false);

  const grouped = useMemo(groupedModules, []);

  const currentQuestion = state ? state.plan[state.currentRung - 1] : null;
  const tierTimer = currentQuestion ? timerForRung(state.currentRung, currentQuestion) : 0;

  // Load bank when game starts. Explanations are fetched one-at-a-time
  // post-lock so they don't leak via the network tab pre-answer.
  const startGame = useCallback(async () => {
    setLoadError(null);
    try {
      const questionsRes = await fetch(`/data/questions/${moduleId}.json`);
      if (!questionsRes.ok) throw new Error(`questions ${questionsRes.status}`);
      const questionBank = await questionsRes.json();
      const { plan, warnings } = pickSessionQuestions(questionBank);
      if (warnings.length) {
        for (const w of warnings) console.warn("question pool:", w);
      }
      setState(createInitialState({ name: name.trim() || "wonk", moduleId, plan }));
      setExplanationVisible(false);
      setScreen(SCREEN_PLAYING);
    } catch (e) {
      setLoadError(`Failed to load module: ${e.message}`);
    }
  }, [moduleId, name]);

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
    setTimerRunning(false);
    setScreen(SCREEN_ONBOARDING);
  }, []);

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
    // Brief suspense pause (1.5s) before reveal — see 02-game-design.md
    await new Promise((r) => setTimeout(r, 1500));
    setState((s) => reveal(s, correct, exp, correctIdx));
    setExplanationVisible(true);
  }, [state, explanations]);

  // Auto-advance after correct, or end after wrong, on user click
  const handleNext = useCallback(() => {
    setExplanationVisible(false);
    setState((s) => {
      if (s.status === "revealed-correct") {
        const next = advanceToNextQuestion(s);
        return next;
      }
      if (s.status === "revealed-wrong") return endAfterWrong(s);
      return s;
    });
  }, []);

  const handleWalkAway = useCallback(() => {
    if (!state || !canWalkAway(state)) return;
    if (!confirm(`Walk away with current safety-net points? You're sure, ${state.playerName}?`)) return;
    setTimerRunning(false);
    setState((s) => walkAway(s));
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
          <p className="text-sm uppercase tracking-widest opacity-70">Round one</p>
          <h1 className="text-3xl md:text-4xl font-semibold mt-2">Pick your poison</h1>
        </header>

        <label className="flex flex-col gap-2">
          <span className="text-sm opacity-80">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Wonk-in-training"
            className="px-3 py-2 rounded bg-[var(--color-indigo-faded)]/40 border border-[var(--color-cream)]/20 text-[var(--color-cream)]"
          />
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm opacity-80 mb-1">Module</legend>
          {grouped.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-widest opacity-60">{g.group}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModuleId(m.id)}
                    className={`px-3 py-2 rounded border text-sm text-left ${
                      moduleId === m.id
                        ? "border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/15"
                        : "border-[var(--color-cream)]/20 hover:border-[var(--color-functional-marigold)]/60"
                    }`}
                  >
                    <span className="font-mono opacity-70">{m.code}</span>
                    <span className="ml-2">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm opacity-80">Language mode</legend>
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
              className="px-3 py-2 rounded border border-[var(--color-cream)]/15 opacity-50 cursor-not-allowed"
              title="Coming soon"
            >
              Indian — coming soon
            </button>
            <button
              type="button"
              disabled
              className="px-3 py-2 rounded border border-[var(--color-cream)]/15 opacity-50 cursor-not-allowed"
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
          onClick={startGame}
          className="px-6 py-3 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold"
        >
          Begin
        </button>
      </section>
    );
  }

  if (!state) return null;

  if (state.status === "won" || state.status === "lost" || state.status === "walked-away") {
    return <EndScreen state={state} onPlayAgain={resetToOnboarding} />;
  }

  const showNextButton =
    state.status === "revealed-correct" || state.status === "revealed-wrong";
  const lockEnabled =
    state.selectedAnswer != null && !state.answerLocked && state.status === "reveal-question";

  return (
    <div className="grid md:grid-cols-[1fr_240px] gap-6">
      <section className="flex flex-col gap-5">
        <IqbalJi expression={expressionFor(state)} line={beatLine(state)} />

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

        <Question
          question={currentQuestion}
          selectedIndex={state.selectedAnswer}
          locked={state.answerLocked}
          eliminated={state.fiftyFiftyEliminated}
          revealCorrect={
            state.status === "revealed-correct" || state.status === "revealed-wrong"
              ? state.correctIndex
              : null
          }
          onSelect={handleSelect}
          onRevealComplete={handleRevealComplete}
        />

        {explanationVisible && state.explanation && (
          <div className="border-l-4 border-[var(--color-sienna-burnt)] pl-4 py-2 text-sm opacity-90">
            <p className="text-xs uppercase tracking-widest opacity-60 mb-1">
              Why
            </p>
            {state.explanation}
          </div>
        )}

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
          {showNextButton && (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold"
            >
              {state.status === "revealed-correct" ? "Next question" : "See result"}
            </button>
          )}
        </div>
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

