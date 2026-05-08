import { useEffect, useState } from "react";

// Reveals `text` one character at a time. `onDone` fires once the
// last character is typed. `cursorWhileTyping` shows a blinking caret
// during the type-out for the stem; can be disabled for short option
// labels where the caret would feel busy.

export default function Typewriter({
  text,
  perCharMs = 35,
  startDelayMs = 0,
  cursorWhileTyping = false,
  onDone,
}) {
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(startDelayMs === 0);

  useEffect(() => {
    setN(0);
    setStarted(startDelayMs === 0);
    if (startDelayMs > 0) {
      const t = setTimeout(() => setStarted(true), startDelayMs);
      return () => clearTimeout(t);
    }
  }, [text, startDelayMs]);

  useEffect(() => {
    if (!started) return;
    if (n >= text.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setN((x) => x + 1), perCharMs);
    return () => clearTimeout(t);
  }, [n, text, perCharMs, started, onDone]);

  const typing = n < text.length;
  return (
    <>
      {text.slice(0, n)}
      {typing && cursorWhileTyping && (
        <span className="inline-block w-2 ml-0.5 animate-pulse">▌</span>
      )}
    </>
  );
}
