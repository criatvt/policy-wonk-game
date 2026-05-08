import { useEffect, useState } from "react";
import Typewriter from "./Typewriter.jsx";

const LETTERS = ["A", "B", "C", "D"];

// Sequential reveal:
//   1. Question stem types out (Typewriter, ~35ms/char + caret)
//   2. 600ms pause
//   3. Option A fades in then types out
//   4. Option B fades in then types out (after A finishes)
//   5. C, then D — same pattern
//   6. 2000ms settle pause
//   7. Timer starts (signalled via onRevealComplete)
//
// `optionsTyped` advances when each option finishes its own typewriter.
// We never type two options at once — keeps the read flow linear.

export default function Question({
  question,
  selectedIndex,
  locked,
  eliminated = [],
  // null while answering; the index of the correct option once the
  // engine has revealed (used to paint green / red).
  revealCorrect = null,
  onSelect,
  onRevealComplete,
}) {
  const [stemDone, setStemDone] = useState(false);
  const [optionsTyped, setOptionsTyped] = useState(0); // 0..4
  const [pauseAfterStem, setPauseAfterStem] = useState(false);

  // Reset on new question
  useEffect(() => {
    setStemDone(false);
    setOptionsTyped(0);
    setPauseAfterStem(false);
  }, [question.id]);

  // After stem finishes typing, hold a 1000ms pause before option A so
  // the player can absorb the question before options arrive.
  useEffect(() => {
    if (!stemDone || pauseAfterStem) return;
    const t = setTimeout(() => setPauseAfterStem(true), 1000);
    return () => clearTimeout(t);
  }, [stemDone, pauseAfterStem]);

  // After all 4 options typed, give a long settle pause (4s) so the
  // player can re-read everything in calm before the timer starts.
  useEffect(() => {
    if (optionsTyped !== 4) return;
    const t = setTimeout(() => onRevealComplete?.(), 4000);
    return () => clearTimeout(t);
  }, [optionsTyped, onRevealComplete]);

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[3em] text-lg md:text-xl leading-snug" aria-live="polite">
        <Typewriter
          text={question.question}
          perCharMs={50}
          cursorWhileTyping
          onDone={() => setStemDone(true)}
        />
      </div>

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {question.options.map((opt, i) => {
          const visible = pauseAfterStem && i <= optionsTyped;
          const isTyping = pauseAfterStem && i === optionsTyped;
          const isSelected = selectedIndex === i;
          const isEliminated = eliminated.includes(i);
          const isCorrect = revealCorrect != null && revealCorrect === i;
          const isWrongSelected =
            revealCorrect != null && isSelected && revealCorrect !== i;
          // Visual state precedence: revealed > selected > eliminated > idle.
          let stateClass =
            "border-[var(--color-border)] hover:border-[var(--color-functional-marigold)]";
          if (isCorrect)
            stateClass =
              "border-[var(--color-functional-green)] bg-[var(--color-functional-green)]/25 ring-2 ring-[var(--color-functional-green)]/40";
          else if (isWrongSelected)
            stateClass =
              "border-[var(--color-functional-red)] bg-[var(--color-functional-red)]/25";
          else if (revealCorrect != null)
            stateClass = "border-[var(--color-border)] opacity-50";
          else if (isEliminated) stateClass = "opacity-30 line-through";
          else if (locked && isSelected)
            stateClass =
              "border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/25 ring-2 ring-[var(--color-functional-marigold)]/50";
          else if (locked) stateClass = "opacity-40";
          else if (isSelected)
            stateClass =
              "border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/15";

          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => !locked && !isEliminated && onSelect(i)}
                disabled={locked || isEliminated || !visible}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded border-2 ${stateClass}`}
                style={{
                  opacity: visible ? 1 : 0,
                  pointerEvents: visible ? "auto" : "none",
                  transition: "opacity 250ms ease, border-color 200ms ease, background-color 200ms ease",
                }}
                aria-hidden={!visible}
              >
                <span
                  className="font-mono text-[var(--color-text-muted)] shrink-0 w-6 text-center"
                  aria-hidden
                >
                  {LETTERS[i]}
                </span>
                <span className="flex-1">
                  {isTyping ? (
                    <Typewriter
                      text={opt}
                      perCharMs={30}
                      startDelayMs={500}
                      onDone={() => setOptionsTyped((n) => n + 1)}
                    />
                  ) : visible ? (
                    opt
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
