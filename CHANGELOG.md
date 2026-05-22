# Changelog

All notable changes to Policy Wonk. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the caveat that the leading `0.` reflects beta status.

## [Unreleased]

- Re-author CP 22 / CG 1 / CP 10 notes through the proper `scripts/ingest.js` pipeline using the actual GCPP source PDFs. Current notes were authored from question-bank explanations + general public-policy knowledge (sub-agent couldn't reach the source PDFs). See [`CONTRIBUTING.md`](policy-wonk-game/CONTRIBUTING.md) for the pipeline.
- Expand note slug coverage so every `topic` in the question banks has a 1:1 note file, or add a graceful fallback page. The end-screen "Browse notes for [topic]" link currently 404s for uncovered slugs.
- Pixel-letter render surface for avatars — `avatar_slug` is stored at signup but no UI displays it yet. When `/me` or in-game avatar lands, drop in a pixel font (e.g. Press Start 2P) and render the letter.
- Pre-launch checklist update — add an end-to-end signup smoke test against the production environment so missing D1 migrations / unset secrets surface before the first real user hits them. (Phase 1 launched with prod D1 unmigrated; caught in post-launch QA.)
- Per-email magic-link rate limit feels tight (3 per 15 min, silent block). Consider raising to 5–8 per 15 min or surfacing a visible "you've requested several links; check spam or wait a few minutes" message.

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
