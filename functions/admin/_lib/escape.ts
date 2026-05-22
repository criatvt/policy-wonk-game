// Minimal HTML escape + a tagged template that auto-escapes interpolated
// values. Admin pages render server-side: every value pulled from D1
// (email, nickname, module ids, etc.) must pass through escapeHtml before
// it lands in the HTML output. The html`` tag does this automatically.

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_MARKER = Symbol.for("policy-wonk-admin/safe-html");

export type SafeHtml = { __html: string; [SAFE_MARKER]: true };

function isSafe(v: unknown): v is SafeHtml {
  return !!v && typeof v === "object" && SAFE_MARKER in (v as object);
}

// html`<p>${userValue}</p>` — interpolated values are escaped unless they
// are themselves SafeHtml (the result of another html`` call) or an array
// of SafeHtml fragments. Returns SafeHtml so it composes safely.
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
  let out = "";
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) {
      const v = values[i];
      if (isSafe(v)) {
        out += v.__html;
      } else if (Array.isArray(v)) {
        out += v
          .map((item) => (isSafe(item) ? item.__html : escapeHtml(item)))
          .join("");
      } else {
        out += escapeHtml(v);
      }
    }
  });
  return { __html: out, [SAFE_MARKER]: true };
}

// Pull the raw string out of a SafeHtml at the response boundary.
export function render(s: SafeHtml): string {
  return s.__html;
}

// Wrap a string of trusted HTML (e.g. a constant template literal you
// constructed) so it survives html`` interpolation without re-escaping.
// Use sparingly.
export function raw(s: string): SafeHtml {
  return { __html: s, [SAFE_MARKER]: true };
}
