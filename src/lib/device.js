// Phone and installed-app detection (#65, plan in #5).
//
// "Phone" means a touch device whose short side is under 600px. It is a
// media query, not a breakpoint and not user-agent sniffing: a narrow
// desktop window has a fine pointer so it never matches, and tablets have a
// short side of 600px or more (an iPad mini is 744) so they never match
// either. Desktop and tablets keep the desktop web; only phones get the
// phone UI. Both sides are tested so a phone still matches in landscape.
//
// Two consumers read these queries, and they must agree:
//   - CSS, through <html data-device="phone"> and <html data-standalone>.
//     BaseLayout's render-blocking <head> script sets both before first
//     paint, from the constants below, and keeps them current on change.
//     The `phone:` and `standalone:` Tailwind variants in global.css key
//     off those attributes.
//   - React, through useIsPhone() and useStandalone() below.
//
// The constants live here, once. BaseLayout imports them at build time and
// passes them into its inline script, so the two can't drift apart.
import { useSyncExternalStore } from "react";

export const PHONE_QUERY =
  "(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)";

export const STANDALONE_QUERY = "(display-mode: standalone)";

// One store per query, so every component subscribing to the same query
// shares a single MediaQueryList. Server-safe: nothing touches `window`
// until React calls subscribe or getSnapshot on the client.
function mediaQueryStore(query) {
  let mql = null;
  const list = () => (mql ??= window.matchMedia(query));
  return {
    subscribe(onChange) {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const m = list();
      // Safari before 14 only has the deprecated addListener.
      if (m.addEventListener) {
        m.addEventListener("change", onChange);
        return () => m.removeEventListener("change", onChange);
      }
      m.addListener(onChange);
      return () => m.removeListener(onChange);
    },
    getSnapshot() {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return list().matches;
    },
    // Static HTML is built without a device. Islands hydrate with `false`
    // and re-render once on the client if the query matches.
    getServerSnapshot() {
      return false;
    },
  };
}

const phoneStore = mediaQueryStore(PHONE_QUERY);
const standaloneStore = mediaQueryStore(STANDALONE_QUERY);

/** True on a touch device whose short side is under 600px. */
export function useIsPhone() {
  return useSyncExternalStore(
    phoneStore.subscribe,
    phoneStore.getSnapshot,
    phoneStore.getServerSnapshot,
  );
}

/** True when the site is running as an installed, standalone web app. */
export function useStandalone() {
  return useSyncExternalStore(
    standaloneStore.subscribe,
    standaloneStore.getSnapshot,
    standaloneStore.getServerSnapshot,
  );
}
