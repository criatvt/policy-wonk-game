// Lock answer, plus the walk-away button and its "Unlocks at Q6" hint.
// Shown while a question is open. Counterpart to the `lockControls` in
// iOS `PlayingView`. The enabled flags come from GameContainer, and its
// handlers re-check them, so the buttons are a surface, not the gate.

export default function ActionBar({
  lockEnabled,
  walkAwayEnabled,
  currentRung,
  onLock,
  onWalkAway,
}) {
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      <button
        type="button"
        disabled={!lockEnabled}
        onClick={onLock}
        className="px-5 py-2 rounded-[var(--radius-cta)] bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold disabled:opacity-30 hover:opacity-90"
      >
        Lock answer
      </button>
      <div className="ml-auto flex flex-col items-end gap-0.5">
        <button
          type="button"
          disabled={!walkAwayEnabled}
          onClick={onWalkAway}
          className="px-3 py-2 text-xs opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Walk away
        </button>
        {currentRung <= 5 && (
          <span className="text-[10px] opacity-50">
            Unlocks at Q6 (after the first safety net)
          </span>
        )}
      </div>
    </div>
  );
}
