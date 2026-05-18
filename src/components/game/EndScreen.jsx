import { useEffect, useRef } from "react";
import { formatIndianNumber } from "../../lib/gameEngine.js";

const SITE_URL = "https://policywonkgame.aasifj.com";
const PGP_URL = "https://school.takshashila.org.in/pgp";

// Canonical outcomes match the server enum (sessions.outcome). The client
// engine uses "walked-away" historically; normalize at the API boundary.
function outcomeForApi(status) {
  if (status === "won") return "won";
  if (status === "walked-away") return "walked_away";
  if (status === "lost") return "lost";
  return null;
}

function lifelinesUsed(lifelines) {
  if (!lifelines) return [];
  return Object.keys(lifelines).filter((k) => lifelines[k] === false);
}

async function postSession(state) {
  const outcome = outcomeForApi(state.status);
  if (!outcome) return;
  if (!state.clientSessionId || !state.selectedModule) return;

  const payload = {
    client_id: state.clientSessionId,
    module_id: state.selectedModule,
    started_at: new Date(state.startTime).toISOString(),
    ended_at: new Date().toISOString(),
    score: state.score,
    highest_cleared_rung: state.highestClearedRung,
    outcome,
    lifelines_used: lifelinesUsed(state.lifelines),
  };

  try {
    await fetch("/api/me/sessions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // 401 (guest) and 4xx (validation) are silently dropped. Sessions
    // are an enhancement; failing to record one must not break the
    // end-screen for the player.
  } catch {
    // Network failure — same posture as above.
  }
}

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
  const postedRef = useRef(false);

  useEffect(() => {
    if (postedRef.current) return;
    postedRef.current = true;
    postSession(state);
  }, [state]);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      // best-effort
    }
  }

  return (
    <section className="flex flex-col gap-6 max-w-xl mx-auto min-h-[70vh] justify-center">
      <header className="flex flex-col gap-2 py-4 text-center">
        <p className="text-sm uppercase tracking-widest opacity-70">
          {captionForStatus(state.status)}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-tight">
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
          Want to go deeper into Public Policy? Take a look at the{" "}
          <a
            href={PGP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-functional-marigold)] underline decoration-2 underline-offset-2 hover:opacity-80"
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

      <section className="border-t border-[var(--color-border)] pt-6 flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-[var(--color-functional-marigold)]">Open source</h2>
        <p className="text-base text-[var(--color-text)] leading-relaxed">
          Policy Wonk is open-source. The code and design notes live on GitHub.
          Issues, ideas, and pull requests welcome — I'd love your help making this better.
        </p>
        <p className="text-sm">
          <a
            href="https://github.com/criatvt/policy-wonk-game"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-functional-marigold)] underline decoration-2 underline-offset-2 hover:opacity-80"
          >
            View the repo →
          </a>
        </p>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5 flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Upcoming features</h2>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          <li className="flex flex-col gap-0.5">
            <p className="font-serif text-base">Wonky</p>
            <p className="text-sm text-[var(--color-text-soft)]">A host with quirky policy traits.</p>
          </li>
          <li className="flex flex-col gap-0.5">
            <p className="font-serif text-base">Smarter Ask an AI</p>
            <p className="text-sm text-[var(--color-text-soft)]">Richer characters and sharper answers from the four AI experts.</p>
          </li>
          <li className="flex flex-col gap-0.5">
            <p className="font-serif text-base">Notes for revising topics</p>
            <p className="text-sm text-[var(--color-text-soft)]">Curated notes from each module so you can revise the concepts you missed.</p>
          </li>
        </ul>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5 flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Polish & fixes</h2>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          <li className="flex flex-col gap-0.5">
            <p className="font-serif text-base">Mobile optimization</p>
            <p className="text-sm text-[var(--color-text-soft)]">Touch-friendly layouts and tighter type scale on small screens.</p>
          </li>
        </ul>
        <p className="text-sm text-[var(--color-text-soft)]">
          More on the{" "}
          <a
            href="https://github.com/criatvt/policy-wonk-game/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-functional-marigold)] underline decoration-2 underline-offset-2 hover:opacity-80"
          >
            GitHub issue tracker
          </a>.
        </p>
      </section>
    </section>
  );
}
