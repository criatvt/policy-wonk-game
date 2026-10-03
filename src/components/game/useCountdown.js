import { useEffect, useRef, useState } from "react";

// Tier countdown, without a view. Starts when `running` flips true. Pauses
// when running flips false. Calls onExpire() at zero. Returns the seconds
// remaining (fractional) so each view can draw it its own way: the bar in
// Timer.jsx today, a circular countdown on phones later (iOS `TimerView`).
//
// `initialElapsedSec` pre-banks elapsed time at mount — used when a
// player refreshes mid-question and the timer needs to resume at the
// correct remaining value rather than restart from full. GameContainer
// derives it from `state.questionStartedAt`.

export default function useCountdown({
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

  return remaining;
}
