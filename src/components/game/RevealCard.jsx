import { formatIndianNumber } from "../../lib/gameEngine.js";
import { rungMessage } from "../../lib/rungMessage.js";

// Post-lock card: Correct / Incorrect, the explanation, the inter-rung
// message with Continue and walk-away (Q1–Q14 correct), or See result
// (wrong, or Q15). Ends with the "Spot an issue" link pair. Counterpart
// to iOS `RevealView`. Pure surface: GameContainer owns the transitions
// behind each callback.

export default function RevealCard({
  state,
  question,
  onContinue,
  onWalkAway,
  onSeeResult,
}) {
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
              onClick={onContinue}
              className="px-5 py-2 rounded-[var(--radius-cta)] bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
            >
              Continue to Q{cleared + 1}
            </button>
            {/* Walk-away in inter-rung appears only when going into a
                walk-away-eligible rung (Q6+). Cleared 5 means the
                next rung is 6, the first walkable one. */}
            {cleared >= 5 && (
              <button
                type="button"
                onClick={onWalkAway}
                className="px-5 py-2 rounded-[var(--radius-cta)] border border-[var(--color-charcoal)] text-[var(--color-charcoal)] font-semibold hover:bg-[var(--color-charcoal)]/10"
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
          onClick={onSeeResult}
          className="self-start px-5 py-2 rounded-[var(--radius-cta)] bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
        >
          See result
        </button>
      )}

      <div className="border-t border-[var(--color-border)] pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>Spot an issue with this question?</span>
        <a
          href={`mailto:aasif@aasifj.com?subject=${encodeURIComponent(`[Policy Wonk] Issue with ${question.id}`)}&body=${encodeURIComponent(`Module: ${question.module}\nQuestion ID: ${question.id}\n\nWhat's wrong:\n`)}`}
          className="underline hover:opacity-70"
        >
          Email
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={`https://github.com/criatvt/policy-wonk-game/issues/new?title=${encodeURIComponent(`[Question issue] ${question.id}`)}&body=${encodeURIComponent(`**Module:** ${question.module}\n**Question ID:** ${question.id}\n\n**What's wrong:**\n`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-70"
        >
          GitHub issue
        </a>
      </div>
    </div>
  );
}
