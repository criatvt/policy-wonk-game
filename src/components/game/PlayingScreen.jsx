import { LADDER, walkAwayScore } from "../../lib/gameEngine.js";
import Question from "./Question.jsx";
import Ladder from "./Ladder.jsx";
import Timer from "./Timer.jsx";
import Lifelines from "./Lifelines.jsx";
import RevealCard from "./RevealCard.jsx";
import ActionBar from "./ActionBar.jsx";
import WalkAwayConfirm from "./WalkAwayConfirm.jsx";

// The live play screen: status line and timer, the question, then one of
// the reveal card or the lifelines and action bar (or the walk-away
// confirm), with the ladder in the side rail. Counterpart to iOS
// `PlayingView`.
//
// Presentational only. GameContainer owns state, the engine calls, answer
// hashing and the lifeline guards, and passes in the flags and handlers.
// A phone layout is meant to be a sibling of this component that takes
// the same props, not a set of branches inside it.

export default function PlayingScreen({
  state,
  question,
  instant,
  timerSeconds,
  timerRunning,
  timerInitialElapsedSec,
  walkAwayConfirm,
  lockError,
  lockEnabled,
  walkAwayEnabled,
  experts,
  onTimerExpire,
  onSelect,
  onRevealComplete,
  onLock,
  onWalkAway,
  onConfirmWalkAway,
  onCancelWalkAway,
  onContinue,
  onWalkAwayAfterCorrect,
  onSeeResult,
  onUseFiftyFifty,
  onUseAudiencePoll,
  onUseExpert,
  onDismissLifeline,
}) {
  const inReveal =
    state.status === "revealed-correct" || state.status === "revealed-wrong";

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[1fr_240px] gap-6 w-full">
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm opacity-70">
            Question {state.currentRung} of 15 — {LADDER[state.currentRung - 1].difficulty}
          </p>
          {state.status === "reveal-question" && (
            <Timer
              seconds={timerSeconds}
              running={timerRunning}
              initialElapsedSec={timerInitialElapsedSec}
              onExpire={onTimerExpire}
            />
          )}
        </div>

        <Question
          question={question}
          selectedIndex={state.selectedAnswer}
          locked={state.answerLocked}
          eliminated={state.fiftyFiftyEliminated}
          revealCorrect={inReveal ? state.correctIndex : null}
          instant={instant}
          onSelect={onSelect}
          onRevealComplete={onRevealComplete}
        />

        {inReveal && (
          <RevealCard
            state={state}
            question={question}
            onContinue={onContinue}
            onWalkAway={onWalkAwayAfterCorrect}
            onSeeResult={onSeeResult}
          />
        )}

        {state.status === "reveal-question" && !walkAwayConfirm && (
          <Lifelines
            state={state}
            experts={experts}
            onUseFiftyFifty={onUseFiftyFifty}
            onUseAudiencePoll={onUseAudiencePoll}
            onUseExpert={onUseExpert}
            onDismissPanel={onDismissLifeline}
          />
        )}

        {state.status === "reveal-question" && lockError && (
          <p role="alert" className="text-sm text-[var(--color-functional-red)]">
            {lockError}
          </p>
        )}

        {state.status === "reveal-question" && !walkAwayConfirm && (
          <ActionBar
            lockEnabled={lockEnabled}
            walkAwayEnabled={walkAwayEnabled}
            currentRung={state.currentRung}
            onLock={onLock}
            onWalkAway={onWalkAway}
          />
        )}

        {walkAwayConfirm && (
          <WalkAwayConfirm
            amount={walkAwayScore(state.highestClearedRung)}
            onStay={onCancelWalkAway}
            onConfirm={onConfirmWalkAway}
          />
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
