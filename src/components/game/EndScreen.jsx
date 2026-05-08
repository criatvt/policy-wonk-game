import { formatIndianNumber } from "../../lib/gameEngine.js";

// Three states: won | lost | walked-away. Phase 7 will swap in proper
// dialogue; for now the screen surfaces score, share string, and a
// reset CTA so playtesting works end-to-end.

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
  // Neutral system text. Phase 7 wires Iqbal Ji's approved end-state
  // lines from 07-dialogue-script.md.
  const heading =
    state.status === "won"
      ? "Ladder cleared."
      : state.status === "walked-away"
      ? "Walked away."
      : "Wrong answer.";

  const sub =
    state.status === "won"
      ? "All 15 questions answered correctly."
      : state.status === "walked-away"
      ? `Walked away at Q${state.currentRung}.`
      : `Fell on Q${state.fellOnRung}.`;

  const share = shareString(state);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      // Best-effort; fall through silently for now
    }
  }

  return (
    <section className="flex flex-col gap-6 max-w-xl mx-auto text-center">
      <h2 className="text-3xl md:text-4xl font-semibold">{heading}</h2>
      <p className="opacity-80">{sub}</p>

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
