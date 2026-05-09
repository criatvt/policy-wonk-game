import { formatIndianNumber } from "../../lib/gameEngine.js";

const SITE_URL = "https://policywonkgame.aasifj.com";
const PGP_URL = "https://school.takshashila.org.in/pgp";

function shareString(state) {
  if (state.status === "won") {
    return `🎓 I scored 1 crore credibility points in the Policy Wonk game (all 15 correct!). Check it out: ${SITE_URL}`;
  }
  if (state.status === "walked-away") {
    return `🚶 I walked away with ${formatIndianNumber(state.score)} credibility points in the Policy Wonk game. Check it out: ${SITE_URL}`;
  }
  return `📉 I scored ${formatIndianNumber(state.score)} credibility points in the Policy Wonk game (fell at Q${state.fellOnRung ?? "?"}). Check it out: ${SITE_URL}`;
}

function captionForStatus(status) {
  if (status === "won") return "All fifteen.";
  if (status === "walked-away") return "Walked away.";
  return "Game over.";
}

function headlineForStatus(status, score) {
  if (status === "won") return "1,00,00,000 credibility points";
  return `${formatIndianNumber(score)} credibility points`;
}

export default function EndScreen({ state, onPlayAgain }) {
  const share = shareString(state);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      // best-effort
    }
  }

  return (
    <section className="flex flex-col gap-6 max-w-xl mx-auto">
      <header className="flex flex-col gap-2 py-4 text-center">
        <p className="text-sm uppercase tracking-widest opacity-70">
          {captionForStatus(state.status)}
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold">
          {headlineForStatus(state.status, state.score)}
        </h1>
        {state.status === "lost" && state.fellOnRung && (
          <p className="text-sm opacity-70">Fell at Q{state.fellOnRung}.</p>
        )}
        {state.playerName && (
          <p className="text-sm opacity-80 mt-2">Well played, {state.playerName}.</p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <p className="text-sm opacity-80">Share string</p>
        <textarea
          readOnly
          value={share}
          className="w-full p-3 rounded bg-[var(--color-bg-soft)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)]"
          rows={3}
        />
        <button
          type="button"
          onClick={copyShare}
          className="self-start px-4 py-2 rounded border border-[var(--color-charcoal)] text-[var(--color-charcoal)] hover:bg-[var(--color-charcoal)]/10"
        >
          Copy to clipboard
        </button>
      </div>

      <div className="border-t border-[var(--color-border)] pt-5 text-center">
        <p className="text-sm leading-relaxed">
          Want to go deeper into Indian public policy? Take a look at the{" "}
          <a
            href={PGP_URL}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-functional-marigold)] decoration-2 underline-offset-2 hover:opacity-90"
          >
            Takshashila PGP programme
          </a>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={onPlayAgain}
        className="self-center mt-2 px-6 py-3 rounded bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
      >
        Play again
      </button>
    </section>
  );
}
