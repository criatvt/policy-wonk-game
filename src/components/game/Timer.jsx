import { useEffect, useRef, useState } from "react";

// Tier-based countdown. Starts when `running` flips true. Pauses when
// running flips false. Calls onExpire() at zero. Visual warning kicks
// in at the last 5 seconds (functional red).
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
  const [remaining, setRemaining] = useState(
    Math.max(0, seconds - initialElapsedSec),
  );
  const expiredRef = useRef(false);
  const startStampRef = useRef(null);
  const accumulatedRef = useRef(initialElapsedSec * 1000);
  const rafRef = useRef(null);

  // Reset when `seconds` changes (new question). `initialElapsedSec`
  // is intentionally read at mount only — it represents elapsed time
  // already banked before this component took over.
  useEffect(() => {
    setRemaining(Math.max(0, seconds - initialElapsedSec));
    expiredRef.current = false;
    accumulatedRef.current = initialElapsedSec * 1000;
    startStampRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  useEffect(() => {
    function tick() {
      if (!running) return;
      const now = performance.now();
      const elapsedSec =
        (accumulatedRef.current + (now - startStampRef.current)) / 1000;
      const next = Math.max(0, seconds - elapsedSec);
      setRemaining(next);
      onTick?.(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    if (running) {
      startStampRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } else if (startStampRef.current != null) {
      // Pause: bank elapsed time
      accumulatedRef.current += performance.now() - startStampRef.current;
      startStampRef.current = null;
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seconds]);

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
      <div className="flex-1 h-2 bg-[var(--color-bg-soft)] rounded overflow-hidden min-w-[120px]">
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
