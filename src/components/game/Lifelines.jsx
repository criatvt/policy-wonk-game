import { useState } from "react";

const LETTERS = ["A", "B", "C", "D"];

// Three lifeline buttons + their result panels (audience poll bars,
// expert verdict). Each lifeline is single-use per session and pauses
// the game timer while open. Activation logic lives in GameContainer;
// this component is the surface.

export default function Lifelines({
  state,
  experts,
  onUseFiftyFifty,
  onUseAudiencePoll,
  onUseExpert,
  onDismissPanel,
}) {
  const [openPanel, setOpenPanel] = useState(null); // null | "poll" | "expert" | "expert-pick"
  const [selectedExpert, setSelectedExpert] = useState(null);

  const disabled = state.status !== "reveal-question" || state.answerLocked;

  function handleFiftyFifty() {
    if (disabled || !state.lifelines.fiftyFifty) return;
    onUseFiftyFifty();
  }

  function handlePoll() {
    if (disabled || !state.lifelines.poll) return;
    onUseAudiencePoll();
    setOpenPanel("poll");
  }

  function handleExpertOpen() {
    if (disabled || !state.lifelines.expert) return;
    setOpenPanel("expert-pick");
  }

  function handleExpertPick(expertId) {
    onUseExpert(expertId);
    setSelectedExpert(expertId);
    setOpenPanel("expert");
  }

  function handleDismiss() {
    setOpenPanel(null);
    setSelectedExpert(null);
    onDismissPanel?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <LifelineButton
          label="50:50"
          used={!state.lifelines.fiftyFifty}
          disabled={disabled}
          onClick={handleFiftyFifty}
        />
        <LifelineButton
          label="Audience Poll"
          used={!state.lifelines.poll}
          disabled={disabled}
          onClick={handlePoll}
        />
        <LifelineButton
          label="Ask Your Professor ✨"
          used={!state.lifelines.expert}
          disabled={disabled}
          onClick={handleExpertOpen}
        />
      </div>

      {openPanel === "poll" && state.pollData && (
        <PollPanel data={state.pollData} onClose={handleDismiss} />
      )}

      {openPanel === "expert-pick" && (
        <ExpertPicker
          experts={experts}
          onPick={handleExpertPick}
          onClose={handleDismiss}
        />
      )}

      {openPanel === "expert" && state.expertVerdict && (
        <ExpertPanel
          experts={experts}
          verdict={state.expertVerdict}
          onClose={handleDismiss}
        />
      )}
    </div>
  );
}

function LifelineButton({ label, used, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={used || disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded border text-sm transition-opacity ${
        used
          ? "border-[var(--color-border)] line-through opacity-40 cursor-not-allowed"
          : disabled
          ? "border-[var(--color-border)] opacity-40 cursor-not-allowed"
          : "border-[var(--color-charcoal)] text-[var(--color-charcoal)] hover:bg-[var(--color-charcoal)]/10"
      }`}
    >
      {label}
    </button>
  );
}

function PollPanel({ data, onClose }) {
  const max = Math.max(...data, 1);
  return (
    <Panel title="The audience says…" onClose={onClose}>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {data.map((pct, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="font-mono w-6 text-center text-[var(--color-text-muted)]">
              {LETTERS[i]}
            </span>
            <div className="flex-1 h-5 bg-[var(--color-bg-soft)] rounded overflow-hidden">
              <div
                className="h-full bg-[var(--color-functional-marigold)]/70 transition-[width] duration-700"
                style={{ width: `${(pct / max) * 100}%` }}
              />
            </div>
            <span className="font-mono tabular-nums w-10 text-right">{pct}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ExpertPicker({ experts, onPick, onClose }) {
  return (
    <Panel title="Who do you want to call?" onClose={onClose}>
      <ul className="grid sm:grid-cols-2 gap-2 list-none p-0 m-0">
        {experts.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e.id)}
              className="w-full text-left p-3 rounded border border-[var(--color-border)] hover:border-[var(--color-charcoal)]"
            >
              <p className="font-semibold">{e.displayName}</p>
              <p className="text-xs opacity-70 mt-1">{e.quirk}</p>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ExpertPanel({ experts, verdict, onClose }) {
  const expert = experts.find((e) => e.id === verdict.expertId);
  return (
    <Panel title={`${expert?.displayName ?? "Expert"} on the line.`} onClose={onClose}>
      {verdict.line ? (
        <p className="text-base leading-relaxed">{verdict.line}</p>
      ) : (
        <p className="text-base leading-relaxed">
          Option <span className="font-mono text-[var(--color-functional-marigold)]">{LETTERS[verdict.pickedIndex]}</span>.
        </p>
      )}
      <p className="text-xs italic text-[var(--color-text-muted)] mt-1">AI can make mistakes.</p>
    </Panel>
  );
}

function Panel({ title, children, onClose }) {
  return (
    <div className="border border-[var(--color-border-soft)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest opacity-70">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs opacity-70 hover:opacity-100 underline"
        >
          Close
        </button>
      </div>
      {children}
    </div>
  );
}
