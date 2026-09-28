import { Component } from "react";
import GameContainer, { GAME_STATE_KEY } from "./GameContainer.jsx";

// Error boundary around the game.
//
// /play mounts GameContainer with client:only="react", so there is no
// server-rendered fallback: if a render throws, React unmounts the root
// and the page is left with nothing but the Astro header and footer. A
// null-state read in a dependency array did exactly that in v0.1.4 and
// sat unnoticed in production for four days, because a crashed island
// looks like an empty section rather than an error. `npm run build`
// cannot catch it, and nothing else loads the page.
//
// This turns that silent blank into something a player can read, report
// and recover from. It is a backstop, not a licence to leave throwing
// code in place.
class GameErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Game crashed:", error, info?.componentStack);
  }

  // A crash that comes from a corrupt persisted snapshot would repeat on
  // every reload, so recovery has to offer a way out of the snapshot as
  // well as a plain retry.
  handleFreshStart = () => {
    try {
      window.sessionStorage?.removeItem(GAME_STATE_KEY);
    } catch {
      // sessionStorage may be unavailable. The reload is still worth doing.
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const detail = error?.message ? String(error.message) : "Unknown error";

    return (
      <section
        role="alert"
        className="max-w-xl mx-auto min-h-[70vh] flex flex-col justify-center gap-6"
      >
        <div className="flex flex-col gap-4 border border-[var(--color-functional-red)] rounded-[var(--radius-cta)] p-6 bg-[var(--color-bg-panel)]">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-functional-red)]">
            Something broke
          </span>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">
            The game stopped loading.
          </h1>
          <p className="text-[var(--color-text-soft)]">
            This is a bug, not something you did. Reloading usually fixes it.
            If it keeps happening, starting a fresh game clears the saved
            progress that may be causing it.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-[var(--radius-cta)] bg-[var(--color-charcoal)] text-[var(--color-bg)] font-semibold hover:opacity-90"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={this.handleFreshStart}
              className="px-5 py-2 rounded-[var(--radius-cta)] border border-[var(--color-border-soft)] text-[var(--color-text)] font-semibold hover:opacity-70"
            >
              Start a fresh game
            </button>
          </div>

          <div className="border-t border-[var(--color-border)] pt-3 flex flex-col gap-2 text-xs text-[var(--color-text-muted)]">
            <code className="font-mono break-words">{detail}</code>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Telling us about this helps.</span>
              <a
                href={`mailto:aasif@aasifj.com?subject=${encodeURIComponent("[Policy Wonk] The game failed to load")}&body=${encodeURIComponent(`Error: ${detail}\n\nWhat I was doing:\n`)}`}
                className="underline hover:opacity-70"
              >
                Email
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={`https://github.com/criatvt/policy-wonk-game/issues/new?title=${encodeURIComponent("[Crash] The game failed to load")}&body=${encodeURIComponent(`**Error:** \`${detail}\`\n\n**What I was doing:**\n`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-70"
              >
                GitHub issue
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }
}

export default function GameIsland() {
  return (
    <GameErrorBoundary>
      <GameContainer />
    </GameErrorBoundary>
  );
}
