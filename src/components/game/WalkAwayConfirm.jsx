import { formatIndianNumber } from "../../lib/gameEngine.js";

// "Walk away with N credibility points?" Stay or confirm. Replaces the
// lifelines and action bar while open. Counterpart to the
// `walkAwayConfirmBar` in iOS `PlayingView`.

export default function WalkAwayConfirm({ amount, onStay, onConfirm }) {
  return (
    <div className="border border-[var(--color-border-soft)] bg-[var(--color-bg-panel)] rounded-lg p-4 flex flex-col gap-3">
      <p className="text-base">
        Walk away with{" "}
        <span className="font-semibold">
          {formatIndianNumber(amount)}
        </span>{" "}
        credibility points?
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onStay}
          className="px-4 py-2 rounded-[var(--radius-cta)] border border-[var(--color-border-soft)] text-[var(--color-text)] hover:border-[var(--color-text-soft)]"
        >
          Stay in the game
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2 rounded-[var(--radius-cta)] bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
        >
          Yes, walk away
        </button>
      </div>
    </div>
  );
}
