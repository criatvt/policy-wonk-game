// Placeholder host component. Phase 7 swaps in the hand-drawn portraits
// and wires the dialogue picker. For now: a labelled box that surfaces
// the current beat so playtesting can verify state transitions.

const EXPRESSIONS = {
  neutral: "🙂",
  smiling: "😄",
  sad: "😞",
};

export default function IqbalJi({ expression = "neutral", line }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded border border-[var(--color-sienna-burnt)]/40 bg-[var(--color-indigo-faded)]/40"
      aria-live="polite"
    >
      <div
        className="w-12 h-12 rounded-full bg-[var(--color-cream)] text-[var(--color-charcoal)] flex items-center justify-center text-2xl shrink-0"
        aria-label={`Iqbal Ji (${expression})`}
      >
        {EXPRESSIONS[expression] ?? EXPRESSIONS.neutral}
      </div>
      <div className="flex-1">
        <p className="text-xs uppercase tracking-widest opacity-60 mb-1">
          Iqbal Ji
        </p>
        <p className="text-sm leading-relaxed">{line ?? "…"}</p>
      </div>
    </div>
  );
}
