import { useEffect, useState } from "react";

const LETTERS = ["A", "B", "C", "D"];

// Sequential reveal per 02-game-design.md §"Sequential reveal sequence":
//   1. Question text appears (typewriter, ~1.2s for ~100 chars)
//   2. 200ms pause
//   3. Options A, B, C, D fade in (300ms each)
//   4. 300ms pause
//   5. Timer starts (signalled via onRevealComplete)

export default function Question({
  question,
  selectedIndex,
  locked,
  eliminated = [],
  revealCorrect = null,
  onSelect,
  onRevealComplete,
}) {
  const [typedChars, setTypedChars] = useState(0);
  const [optionsShown, setOptionsShown] = useState(0);

  // Reset on new question
  useEffect(() => {
    setTypedChars(0);
    setOptionsShown(0);
  }, [question.id]);

  // Typewriter for the stem
  useEffect(() => {
    if (typedChars >= question.question.length) return;
    const total = question.question.length;
    const per = Math.max(8, Math.min(30, 1200 / total));
    const t = setTimeout(() => setTypedChars((n) => n + 1), per);
    return () => clearTimeout(t);
  }, [typedChars, question.question]);

  // After stem is fully typed: pause then fade options in one by one
  useEffect(() => {
    if (typedChars < question.question.length) return;
    if (optionsShown >= 4) return;
    const delay = optionsShown === 0 ? 200 : 300;
    const t = setTimeout(() => setOptionsShown((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [typedChars, optionsShown, question.question.length]);

  // After all 4 options visible + 300ms settle, signal reveal complete
  useEffect(() => {
    if (optionsShown !== 4) return;
    const t = setTimeout(() => onRevealComplete?.(), 300);
    return () => clearTimeout(t);
  }, [optionsShown, onRevealComplete]);

  const stemDisplay = question.question.slice(0, typedChars);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="min-h-[3em] text-lg md:text-xl leading-snug"
        aria-live="polite"
      >
        {stemDisplay}
        {typedChars < question.question.length && (
          <span className="inline-block w-2 ml-0.5 animate-pulse">▌</span>
        )}
      </div>

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {question.options.map((opt, i) => {
          const visible = i < optionsShown;
          const isSelected = selectedIndex === i;
          const isEliminated = eliminated.includes(i);
          let stateClass = "border-[var(--color-cream)]/30 hover:border-[var(--color-functional-marigold)]";
          if (isEliminated) stateClass = "opacity-30 line-through";
          else if (revealCorrect === i)
            stateClass = "border-[var(--color-functional-green)] bg-[var(--color-functional-green)]/20";
          else if (locked && isSelected && revealCorrect != null && revealCorrect !== i)
            stateClass = "border-[var(--color-functional-red)] bg-[var(--color-functional-red)]/20";
          else if (isSelected)
            stateClass = "border-[var(--color-functional-marigold)] bg-[var(--color-functional-marigold)]/15";

          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => !locked && !isEliminated && onSelect(i)}
                disabled={locked || isEliminated}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded border-2 transition-opacity ${stateClass}`}
                style={{
                  opacity: visible ? 1 : 0,
                  pointerEvents: visible ? "auto" : "none",
                  transition: "opacity 300ms ease, border-color 200ms ease, background-color 200ms ease",
                }}
                aria-hidden={!visible}
              >
                <span
                  className="font-mono text-[var(--color-sienna-pale)] shrink-0 w-6 text-center"
                  aria-hidden
                >
                  {LETTERS[i]}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
