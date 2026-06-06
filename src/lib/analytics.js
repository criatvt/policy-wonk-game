// First-party, privacy-respecting funnel events (#12).
//
// Cloudflare Web Analytics (the beacon in BaseLayout) measures traffic but
// has no custom-event API, so the quiz funnel is logged first-party: a
// fire-and-forget POST to /api/events, which writes an aggregate data point
// to Cloudflare Workers Analytics Engine. NO PII — no name, email, IP, or
// user id is ever sent. Analytics must never break or slow gameplay, so
// every failure here is swallowed silently.
//
// Keep this allowlist in sync with the server-side allowlist in
// functions/api/_routes/events.ts.
const ALLOWED_EVENTS = new Set([
  "game_started",
  "module_chosen",
  "game_completed",
]);

export function trackEvent(event, props = {}) {
  if (!ALLOWED_EVENTS.has(event)) return;
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ event, ...props });
    // sendBeacon survives a page unload (e.g. the player closes the tab on
    // the end screen) and never blocks the main thread. Fall back to a
    // keepalive fetch where it's unavailable.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics is best-effort; a serialization or beacon failure must not
    // surface to the player.
  }
}
