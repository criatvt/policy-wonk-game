# Changelog

All notable changes to Policy Wonk. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the caveat that the leading `0.` reflects beta status.

## [Unreleased]

- Re-author CP 22 / CG 1 / CP 10 notes through the proper `scripts/ingest.js` pipeline using the actual GCPP source PDFs. Current notes were authored from question-bank explanations + general public-policy knowledge (sub-agent couldn't reach the source PDFs). See [`CONTRIBUTING.md`](policy-wonk-game/CONTRIBUTING.md) for the pipeline.
- Expand note slug coverage so every `topic` in the question banks has a 1:1 note file, or add a graceful fallback page. The end-screen "Browse notes for [topic]" link currently 404s for uncovered slugs.
- Pixel-letter render surface for avatars — `avatar_slug` is stored at signup but no UI displays it yet. When `/me` or in-game avatar lands, drop in a pixel font (e.g. Press Start 2P) and render the letter.
- Pre-launch checklist update — add an end-to-end signup smoke test against **both staging and production** so missing D1 migrations / unset secrets surface before any real user (or the admin) hits them. (Phase 1 launched with prod D1 unmigrated; v0.3.0 hit the same trap on staging during admin-panel QA.)
- Per-email magic-link rate limit feels tight (3 per 15 min, silent block). Consider raising to 5–8 per 15 min or surfacing a visible "you've requested several links; check spam or wait a few minutes" message.

## [0.3.3] — 2026-05-22 — Revision notes for 6 more modules

Partial completion of #40. Six of the eight previously-uncovered modules ship with full notes coverage; two stay in the WIP branch for a follow-up.

### Added

- **219 new revision notes** across six modules (notes drafted by a sub-agent off the proper `scripts/ingest.js` PDF pipeline, source PDFs from the GCPP syllabus):
  - `cp-11` Nationalism and State (42 notes)
  - `cp-12` State Capacity (41 notes)
  - `cp-13` Policy Design (29 notes)
  - `cp-21` Microeconomic Foundations (37 notes)
  - `cp-23` Supply, Demand, Equilibrium (31 notes)
  - `cp-33` Policy Communication (41 notes)
- **Plus the missing `protectionism` note for `cp-25`** — completes that module too (39/39 coverage).
- Two helper scripts on the branch (used by the authoring workflow): `scripts/list-topics.mjs` (list unique topic slugs per module) and `scripts/topic-context.mjs` (gather extracted-PDF snippets for a topic).

### Deferred

- **`cs-11` (Strategic Studies)** — not in this release. Blocked on a question-bank data-quality issue: the cs-11 `topic` field mixes Title-Case (`"Strategic Studies"`) and kebab-case (`"strategic-studies"`) for the same concepts, so notes can't route deterministically until the bank is reconciled. Tracked on `feat/40-notes-8-modules` for resume.

### Changed

- Footer version: `Beta v0.3.2` → `Beta v0.3.3`. `package.json`: `0.3.2` → `0.3.3`.

## [0.3.2] — 2026-05-22 — v0.3.1 hotfixes (chip styling, direct sign-in)

Three issues surfaced within minutes of the v0.3.1 prod deploy.

### Fixed

- **Auth chip rendered as raw text** (`Aadmin`, with no avatar pill or spacing). Astro auto-scopes `<style>` tags by suffixing rule selectors with an `astro-XXXXX` data attribute — DOM that the inline script injects via `innerHTML` doesn't carry that attribute, so the rules never matched. Switched `Header.astro`'s `<style>` to `<style is:global>`.
- **Header "Sign in" landed on the upsell**. Clicking *Sign in* in the header dropped the user on `/login`'s "Two ways in" chooser, which is unwanted for header clickers (who already know they want to sign in). The link now sends `?show=email`; `/login` server-side skips the chooser + benefits panels and focuses straight into the email input. Headline swaps from "Two ways in." to "Sign in." in that mode.
- **Homepage "Or browse the notes →" removed**. Redundant now that `Notes` lives in the top header. Single primary CTA (`Play →`) is enough.

### Changed

- Footer version: `Beta v0.3.1` → `Beta v0.3.2`. `package.json`: `0.3.1` → `0.3.2`.

## [0.3.1] — 2026-05-22 — Site-wide header + logged-in indicator

Closes #36. Two threads of feedback from the v0.3.0 prod smoke test converged on the same surface: there was no visible cue that the user was signed in, and notes were not reachable from a menu (because there was no menu).

### Added

- **Site-wide top header** (`src/components/shared/Header.astro`, slotted into `BaseLayout`). Wordmark on the left, `Notes` and `Search` links in the middle, auth chip on the right. Replaces the previous arrangement where each page rendered its own inline header and notes were reachable only via the end-screen link.
- **Auth chip (closes #36)** — when signed in, shows the user's avatar letter + nickname; click opens a menu with the user's email and a **Sign out** action (POSTs to `/api/auth/logout`, clears the local cache, reloads to `/`). When signed out, shows a `Sign in` link.
- Auth state is fetched client-side from `/api/me` and cached in `sessionStorage` for 5 minutes to avoid the round-trip on every intra-tab nav.
- **Homepage refresh** — new "What's new" section calling out the Phase 1 player-facing features (revision notes, optional sign-in). Renamed "Smarter Ask an AI" → "Smarter Ask a Professor" in the Upcoming list to match the live lifeline name.

### Changed

- Footer version: `Beta v0.3` → `Beta v0.3.1`. `package.json`: `0.3.0` → `0.3.1`.

## [0.3.0] — 2026-05-22 — Admin panel (Phase 1 / Track D)

Closes the deferred Phase 1 track. Read-only admin tool for the solo operator (Aasif) — no edit/delete, no exports, no audit log; those are explicit non-goals per #26.

### Added

- **Admin panel** (#26) at `/admin`. Routes: dashboard (total users / signups in last 7 days / sessions today / most-played module), `/admin/users` (paginated list with email search), `/admin/users/[id]` (profile + played modules + full session history), `/admin/sessions` (filterable by module / outcome / date range).
- **Admin authorization**. Every `/admin/*` request runs through a guard middleware that reads the session cookie, looks up the user, and checks `is_admin = 1`. Non-admins (and logged-out callers) get a real 404 — no admin chrome, no nav, no hint the route exists. The allowlist is the `ADMIN_EMAILS` env var (`aasif@aasifj.com` across dev/preview/prod), checked once at login by `upsertUserOnLogin`. `is_admin` is verified live on every request, so revoking admin = one column update, no session invalidation needed.
- **Privacy disclosure** in `/privacy` — "Who can see your account data" section spelling out that the admin can view email / nickname / avatar / play history. No team, no third-party processor, no shared dashboard.

### Notes on implementation

- Admin pages are rendered server-side as HTML strings via a Hono catch-all at `functions/admin/[[path]].ts`. Different pattern from the rest of the (static) site — isolated to `/admin` so a non-admin curl of any admin URL returns a real 404 with no admin markup. Tagged `html\`\`` template auto-escapes all interpolated values.
- No new DB migration — `users.is_admin` was already present in `0001_users.sql` (added at the original Phase 1 backend setup with #26 in mind).
- No client JS in the admin tree. Search and filters are plain GET forms; pagination is offset-based; LIKE search uses `ESCAPE '\'` with proper `%`/`_`/`\` escaping.

### Fixed (during staging QA, pre-merge)

- **Routing**. Hono's `.basePath("/admin")` worked under `wrangler pages dev` but did not match the bare `/admin` URL on the deployed Pages Functions runtime — requests fell through to `notFound`. Removed `basePath` and registered every route with its full `/admin/...` path.
- **`is_admin` strict equality**. The guard's `user.is_admin !== 1` would fail if D1 ever returned the INTEGER column as a bigint (`1n !== 1`). Switched to `Number(user.is_admin) !== 1` so the check survives both number and bigint return types. Same fix applied to the admin pill in the user-list and user-detail views.
- **Allowlist refresh on returning logins**. `upsertUserOnLogin` only set `is_admin` on INSERT — meaning the allowlist effectively froze at a user's first login, and changing `ADMIN_EMAILS` afterwards did nothing. Now every login UPDATE refreshes `is_admin` from the current env var.
- **onError no longer masquerades as 404**. The admin app's `onError` previously returned the Not Found HTML with status 500. Browsers showed "Not found" while the server was actually erroring; cost an hour of misdirected debugging against a missing staging D1 migration. Now returns a visibly distinct "Server error" page with the exception message inline.
- **Staging D1 migration applied**. The `sessions` table never landed in the `policy-wonk-staging` D1 — only the `users` table from `0001_users.sql` was present. Caused the dashboard's session-count queries to throw on first contact. Ran `npm run db:migrate:staging` and verified.

### Changed

- Footer version: `Beta v0.2.1` → `Beta v0.3`. `package.json`: `0.2.1` → `0.3.0`.

## [0.2.1] — 2026-05-19 — Phase 1 post-launch hotfixes

Three issues surfaced within the first hour on production. None changed core feature behaviour; all are correctness fixes.

### Fixed

- **Magic-link sign-in loop** (commit `a140bb1`). Email link-scanners (Microsoft 365 Safe Links, some corporate spam gateways, Apple Mail link preview) were GET-fetching the magic link before the real user clicked, consuming the one-shot token and dropping the user into a `?error=invalid_or_expired` loop on `/login`. Now: email links point to a new static `/auth/confirm?token=…` page; the user clicks "Sign me in →" which POSTs to `/api/auth/verify`. Only the form submission consumes the token. `GET /api/auth/verify` redirects to the confirm page without consuming, so existing-in-inbox emails also work.
- **Production D1 schema** (operational, not code). Pre-launch QA exercised the auth flow against the local dev database; the migrations had never been applied to the production D1, so the first real signup threw `no such table: users` and surfaced as `{ok:false,error:"internal_error"}` from `app.onError`. Migrations applied via `wrangler d1 migrations apply policy-wonk-prod --env production --remote`. Captured as a follow-up in `[Unreleased]` for the pre-launch checklist.
- **End-screen share affordance** (#35, commit `49586e6`). The "Share string" textarea + "Copy to clipboard" pair felt like dev chrome. Replaced with a single "Share →" button: uses `navigator.share` (mobile native sheet) where available, falls back to clipboard copy with a brief inline "Copied to clipboard!" confirmation. The share text remains visible as a small italic preview line above the button.

### Changed

- Footer version: `Beta v0.2` → `Beta v0.2.1`. `package.json` version: `0.2.0` → `0.2.1`.

## [0.2.0] — 2026-05-19 — Phase 1: Notes + Accounts

The learning-loop release. Login becomes optional and benefits-led; guest play remains first-class. Revision notes ship for three lead modules. None of the v1 game loop changes.

### Added

- **Magic-link login** (`/login`) backed by Cloudflare Workers + D1 + KV (#15 #16). Email-only — no passwords.
- **Signup flow** — nickname at `/onboarding/nickname`. Avatar is auto-derived from the nickname's first letter (#17 #18); the manual picker step was simplified out.
- **Play as Guest path** (#19) — first-class entry option on `/login`, equal visual weight with Sign in. Guest game state persists in `sessionStorage` (survives refresh, gone on tab close).
- **Saved session history** (#21) and **module-played tracking** (#22) for logged-in players. One row per finished game; powers the notes unlock.
- **Guest-to-account merge** (#20) — guests who sign in within the same tab have their finished sessions folded into the new account's history via `POST /api/me/sessions/merge`. Idempotent on `(user_id, client_id)`.
- **Revision notes** for three lead modules — CP 22 (Public Economics — Markets), CG 1 (Culture & Society), CP 10 (Public Systems Thinking) (#13). 27 topic notes + 3 module indexes.
- **Notes routes** (#8) — `/notes`, `/notes/<module>/`, `/notes/<module>/<topic>` powered by Astro content collections.
- **Notes index lock state** (#14) — per-module locked/unlocked indicators on the `/notes` index, driven by the player's `played_modules`.
- **Pagefind search for notes** (#9) — `/search` page + `SearchBar` component in the notes zone.
- **End-screen notes link** (#10) — for logged-in players on a lost game, the end screen surfaces a "Browse notes for [topic]" link to the relevant note.
- **Per-game upsells** — pre-game (#23) two equal CTAs + adjacent benefits block on `/login`; post-game (#24) variant copy by outcome on the guest end screen.
- **Privacy page** (#25) — `/privacy` in plain language. Linked from `/login`, the end-screen upsell, and the site-wide footer.
- **Notes provenance disclosure** in `NoteLayout` and `/notes` index — discloses that notes are a blend of public-domain policy concepts, Aasif's notes, and material adapted from the Takshashila GCPP readings.
- **Notes error-report + contribute CTAs** — per-note footer carries pre-filled mailto + GitHub-issue links, plus a "Have more detailed notes? Contribute on GitHub" invitation.
- **Question issue reporting** post-lock — every explanation card carries small email + GitHub issue links pre-filled with module + question id.
- **Skip in-game name prompt for logged-in users** (#32) — `GameContainer` reads `/api/me` and seeds the nickname automatically; the "Who is playing?" screen is bypassed.

### Changed

- `/login` redesigned into a two-CTA entry with side-by-side Sign-in and Play-as-guest cards (#19 #23). The benefits block sits below the buttons; the email form reveals on demand.
- End-screen copy: "Well played, X." → "Thanks for playing, X." (#33). Stays warm at 0 credibility points or a Q1 fall.
- Mid-question refresh now resumes the timer at the correct remaining seconds via a `questionStartedAt` timestamp on the game state; the Question component renders instantly on rehydrate instead of replaying the typewriter animation.
- Footer site-wide adds `· Privacy` next to `Source on GitHub`. Version bumped from `Beta v0.1` to `Beta v0.2`.

### Fixed

- The cosmetic where the end screen unconditionally said "Well played" even at 0 points / Q1 fall (#33).

### Known issues

- End-screen "Browse notes for [topic]" link 404s for topic slugs that don't yet have a 1:1 note file. Tracked under `[Unreleased]`.
- Notes content for CP 22 / CG 1 / CP 10 was authored from question-bank explanations + general knowledge rather than the actual GCPP source PDFs. Disclosed in the per-note footer; re-authoring through the proper pipeline is tracked under `[Unreleased]`.
- Mid-question refresh while a lifeline panel is open won't honour the pause across the refresh — elapsed time is wall-clock from when the timer first started.

## [0.1.0] — 2026-05-09 — Game loop launch

The first playable version. Quiz works end-to-end; no accounts, no notes.

### Added

- 15-question ladder across four difficulty tiers (easy / medium / hard / expert) with tier-scaled timers (15 / 30 / 45 / 60s).
- Two safety nets (Q5 = 25,000 credibility; Q10 = 1,00,00,000) and walk-away from Q6 onwards.
- Three lifelines: 50:50, Audience Poll, Ask an AI ✨ (four caricatured-professor characters).
- Sequential reveal (typewriter on question stem, fade-in on each option in turn) so reading time is separated from thinking time.
- Storied rules walkthrough on first play, skipped on returning sessions.
- Editorial visual identity: deep teal accent, Playfair Display + Inter type stack, white background.
- 488 questions across 11 GCPP modules.
- Question issue reporting links on the explanation card.

### Deferred to later phases

- The Wonky host character — deferred to v2/v3 after Aasif's playtesting (CLAUDE.md v1 update 2026-05-09).
- Notes for revising topics — Phase 1.
- Optional accounts — Phase 1.
