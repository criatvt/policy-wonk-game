import useCountdown from "./useCountdown.js";

// Tier countdown as a seconds readout plus a bar. The counting lives in
// useCountdown; this is the view. Visual warning kicks in at the last 5
// seconds (functional red).
//
// `initialElapsedSec` pre-banks elapsed time at mount — used when a
// player refreshes mid-question and the timer needs to resume at the
// correct remaining value rather than restart from full.

export default function Timer({
  seconds,
  running,
  initialElapsedSec = 0,
  onExpire,
  onTick,
}) {
  const remaining = useCountdown({
    seconds,
    running,
    initialElapsedSec,
    onExpire,
    onTick,
  });

  const display = Math.ceil(remaining);
  const warning = remaining <= 5 && remaining > 0;
  const pct = Math.max(0, Math.min(1, remaining / seconds));

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={`font-mono text-2xl tabular-nums ${
          warning ? "text-[var(--color-functional-red)]" : ""
        }`}
        aria-live="polite"
        aria-label={`${display} seconds remaining`}
      >
        {display}s
      </div>
      <div className="flex-1 h-2 bg-[var(--color-bg-soft)] rounded-[var(--radius-cta)] overflow-hidden min-w-[120px]">
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${pct * 100}%`,
            background: warning
              ? "var(--color-functional-red)"
              : "var(--color-functional-marigold)",
          }}
        />
      </div>
    </div>
  );
}
