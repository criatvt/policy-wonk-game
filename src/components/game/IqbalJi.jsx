// Hand-drawn portraits live at /public/iqbal-ji/. Three expressions
// keyed off game state (see expressionFor in GameContainer).

const PORTRAITS = {
  neutral: "/iqbal-ji/neutral.png",
  smiling: "/iqbal-ji/smiling.png",
  sad: "/iqbal-ji/sad.png",
};

export default function IqbalJi({ expression = "neutral", line }) {
  const src = PORTRAITS[expression] ?? PORTRAITS.neutral;
  return (
    <div
      className="flex items-start gap-4 p-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
      aria-live="polite"
    >
      <img
        src={src}
        alt={`Iqbal Ji, the host, looking ${expression}`}
        className="w-20 h-20 rounded-full object-cover shrink-0 bg-[var(--color-bg-soft)] border border-[var(--color-border)]"
      />
      <div className="flex-1">
        <p className="text-xs uppercase tracking-widest opacity-60 mb-1">
          Iqbal Ji
        </p>
        <p className="text-sm leading-relaxed">{line ?? "…"}</p>
      </div>
    </div>
  );
}
