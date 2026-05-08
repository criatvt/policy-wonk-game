import { useEffect, useState } from "react";
import { formatIndianNumber } from "../../lib/gameEngine.js";
import { pickLine } from "../../lib/dialoguePicker.js";
import HostTakeover from "./HostTakeover.jsx";

// End-screen flow:
//   1. Primary takeover with the won / lost / walked-away beat (Iqbal Ji
//      reacts in voice; explanation = score recap).
//   2. Continue → secondary takeover with the won-share-prompt OR
//      lost-nudge beat (if applicable). For walked-away the screen ends
//      with the share/score block directly.
//   3. Share string + Play again CTA.

const PRIMARY_BEAT = {
  won: "won",
  lost: "lost",
  "walked-away": "walked-away",
};

const SECONDARY_BEAT = {
  won: "won-share-prompt",
  lost: "lost-nudge",
  "walked-away": null,
};

function shareString(state) {
  const url = "https://policywonkgame.aasifj.com";
  if (state.status === "won") {
    return `🎓 I cracked all 15 on Iqbal Ji's Policy Wonk! 1 crore credibility points. Are you a policy wonk? ${url}`;
  }
  if (state.status === "walked-away") {
    return `🚶 I walked away with ${formatIndianNumber(state.score)} credibility points on Iqbal Ji's Policy Wonk. Took my chips and ran. Are you a policy wonk? ${url}`;
  }
  return `📉 I scored ${formatIndianNumber(state.score)} credibility points on Iqbal Ji's Policy Wonk. Fell at Q${state.fellOnRung ?? "?"}. Are you a policy wonk? ${url}`;
}

export default function EndScreen({ state, onPlayAgain }) {
  const [phase, setPhase] = useState("primary"); // "primary" | "secondary" | "summary"
  const subs = {
    name: state.playerName,
    correct: state.correctIndex != null && state.plan
      ? state.plan[state.currentRung - 1]?.options?.[state.correctIndex] ?? ""
      : "",
    x: formatIndianNumber(state.score),
  };

  const primaryBeat = PRIMARY_BEAT[state.status];
  const secondaryBeat = SECONDARY_BEAT[state.status];
  const [primary] = useState(() => (primaryBeat ? pickLine(primaryBeat, subs) : null));
  const [secondary] = useState(() => (secondaryBeat ? pickLine(secondaryBeat, subs) : null));

  // If we have no primary line (defensive), skip straight to summary.
  useEffect(() => {
    if (!primary) setPhase("summary");
  }, [primary]);

  const tone =
    state.status === "won" ? "correct" : state.status === "lost" ? "wrong" : "neutral";
  const explanationLine = `Final score: ${formatIndianNumber(state.score)} credibility points.`;

  if (phase === "primary" && primary) {
    return (
      <HostTakeover
        expression={primary.expression}
        tone={tone}
        caption={
          state.status === "won"
            ? "All fifteen."
            : state.status === "lost"
            ? `Fell at Q${state.fellOnRung}.`
            : `Walked away.`
        }
        body={primary.text}
        explanation={explanationLine}
        onContinue={() => setPhase(secondary ? "secondary" : "summary")}
        continueLabel={secondary ? "Continue" : "See score"}
      />
    );
  }

  if (phase === "secondary" && secondary) {
    return (
      <HostTakeover
        expression={secondary.expression}
        tone={tone}
        caption={state.status === "won" ? "Share it." : "One more thought."}
        body={secondary.text}
        onContinue={() => setPhase("summary")}
        continueLabel="See score"
      />
    );
  }

  const share = shareString(state);
  async function copyShare() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      // best-effort
    }
  }

  return (
    <section className="flex flex-col gap-6 max-w-xl mx-auto text-center">
      <div className="border border-[var(--color-sienna-burnt)]/40 rounded p-6 bg-[var(--color-indigo-faded)]/30">
        <p className="text-xs uppercase tracking-widest opacity-60">Credibility points</p>
        <p className="text-4xl font-semibold tabular-nums mt-2">
          {formatIndianNumber(state.score)}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm opacity-80">Share string</p>
        <textarea
          readOnly
          value={share}
          className="w-full p-3 rounded bg-[var(--color-charcoal)]/40 border border-[var(--color-cream)]/20 text-sm font-mono"
          rows={3}
        />
        <button
          type="button"
          onClick={copyShare}
          className="px-4 py-2 rounded border border-[var(--color-functional-marigold)] text-[var(--color-functional-marigold)]"
        >
          Copy to clipboard
        </button>
      </div>

      <button
        type="button"
        onClick={onPlayAgain}
        className="mt-4 px-6 py-3 rounded bg-[var(--color-functional-marigold)] text-[var(--color-charcoal)] font-semibold"
      >
        Play again
      </button>
    </section>
  );
}
