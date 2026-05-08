import { LADDER, formatIndianNumber } from "../../lib/gameEngine.js";

// Vertical ladder on desktop (right rail), horizontal pill on mobile.
// Shows rung number, credibility points, safety-net markers, and
// highlights the current rung.

export default function Ladder({ currentRung, highestClearedRung }) {
  return (
    <ol
      className="ladder-rungs flex flex-col-reverse gap-1 list-none p-0 m-0"
      aria-label="Question ladder"
    >
      {LADDER.map((r) => {
        const cleared = r.rung <= highestClearedRung;
        const current = r.rung === currentRung;
        return (
          <li
            key={r.rung}
            className={`flex items-center justify-between gap-3 px-3 py-1 rounded text-sm ${
              current
                ? "bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold"
                : cleared
                ? "text-[var(--color-functional-green)] opacity-80"
                : "text-[var(--color-text-muted)]"
            }`}
            aria-current={current ? "step" : undefined}
          >
            <span className="font-mono w-8 text-right">{r.rung}</span>
            <span className="flex-1 text-right tabular-nums">
              {formatIndianNumber(r.credibility)}
            </span>
            <span
              className="w-3 text-center"
              aria-label={r.isSafetyNet ? "safety net" : undefined}
              title={r.isSafetyNet ? "Safety net" : undefined}
            >
              {r.isSafetyNet ? "•" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
