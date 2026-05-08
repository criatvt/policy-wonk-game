import { useEffect, useState } from "react";
import Typewriter from "./Typewriter.jsx";

// Iqbal Ji takes the foreground. Used in two contexts:
//   - Pre-question (medium tier and above): host delivers a tier-intro
//     line, then steps aside and the question reveals. (Phase 7)
//   - Post-answer: after correct/wrong reveal, host appears large
//     alongside the explanation so character visibility scales with
//     the moment.
//
// Phase 6: this is the post-answer treatment only. The pre-question
// treatment lives behind the dialogue picker (Phase 7).
//
// The body types out at the same readable cadence as the question
// stem so the reveal feels like a single beat rather than two.

const PORTRAITS = {
  neutral: "/iqbal-ji/neutral.png",
  smiling: "/iqbal-ji/smiling.png",
  sad: "/iqbal-ji/sad.png",
};

export default function HostTakeover({
  expression = "neutral",
  caption,
  body,
  onContinue,
  continueLabel = "Continue",
}) {
  const src = PORTRAITS[expression] ?? PORTRAITS.neutral;
  const [bodyDone, setBodyDone] = useState(false);

  // Reset typewriter when body content changes
  useEffect(() => {
    setBodyDone(false);
  }, [body]);

  return (
    <section
      className="flex flex-col items-center gap-5 p-6 rounded-lg border border-[var(--color-sienna-burnt)]/40 bg-[var(--color-indigo-faded)]/30"
      aria-live="polite"
    >
      <img
        src={src}
        alt={`Iqbal Ji, the host, looking ${expression}`}
        className="w-40 h-40 md:w-48 md:h-48 rounded-full object-cover bg-[var(--color-cream)] shrink-0"
      />
      <div className="w-full max-w-2xl flex flex-col gap-3 text-center">
        {caption && (
          <p className="text-sm uppercase tracking-widest opacity-70">{caption}</p>
        )}
        <p className="text-base md:text-lg leading-relaxed">
          {body && (
            <Typewriter
              text={body}
              perCharMs={40}
              startDelayMs={1000}
              cursorWhileTyping
              onDone={() => setBodyDone(true)}
            />
          )}
        </p>
      </div>
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          disabled={!bodyDone}
          className="px-5 py-2 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {continueLabel}
        </button>
      )}
    </section>
  );
}
