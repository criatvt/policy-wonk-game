# Changelog

All notable changes to Policy Wonk. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the caveat that the leading `0.` reflects beta status.

## [Unreleased]

### Added

- **Appearance switch in the header.** Three states mirroring the iOS app's `AppAppearance` enum and reusing its storage key (`policyWonk.appearance`): **system** (the default, which sets no `data-theme` and lets `prefers-color-scheme` decide), light, and dark. Applying the stored choice happens in an inline, render-blocking script in `<head>`; deferring it to the page scripts would flash the wrong theme on every navigation for anyone whose choice differs from their OS. The icons are swapped with `toggleAttribute` rather than `.hidden = …`, because `hidden` is an `HTMLElement` property and these are SVG elements: assigning it sets a JS property that never reflects to the content attribute, so the button would have been stuck on one glyph forever.
- **"Best played on a desktop" note** under the homepage Play button, pointing phone visitors at the iOS app instead.
- **Dark mode, ported from the iOS app.** The web had no dark theme at all; the native build has had a fully adaptive one. `global.css` now carries the exact palette from `PolicyWonk/DesignSystem/Theme.swift` (`bg #0E0E11`, `ink #F2F2F0`, and a brightened functional trio: teal `#46C2CD`, green `#9FD45F`, red `#F26A47`). No component needed a `dark:` variant because every one of them already reads `var(--color-*)`; the dark values are declared once under `prefers-color-scheme` (guarded so an explicit light choice still wins) and once under `:root[data-theme="dark"]`, so a future toggle works in both directions. `--color-charcoal` inverts with the theme, which is what makes the primary CTA read as a black pill on white and a light pill on near-black, the same ink/bg trick `WonkPrimaryButton` uses on iOS.
- **A real share card, matching the iOS one.** Sharing a result used to post plain text. `src/lib/shareCard.js` is a port of `ShareCardView.swift` and draws the same portrait card to a canvas at the same 1080×1350, so a result posted from the web and one posted from the phone are the same picture: cream diagonal gradient, tracked "POLICY WONK" eyebrow, serif module name, outcome eyebrow in its accent colour, the score in Playfair, and the site URL in teal. Like the iOS card it is deliberately **fixed light** and does not read the theme tokens, because an exported image has to look the same whatever mode the reader is in. The end screen shows it as a live preview and shares it through `navigator.share({ files })` where the browser allows file shares, falling back to a PNG download on desktop.
- **TestFlight invitation on the homepage.** An "Also on iPhone" section pointing at the open iOS beta, with collapsible instructions for readers who have never used TestFlight. Shown to everyone so non-Apple readers know the app exists, with the opening line swapped for visitors already on an Apple handheld (iPadOS reports itself as `MacIntel`, so the touch-point count is what separates an iPad from a desktop Mac).

### Removed

- **Stale roadmap content, everywhere it appeared.** The homepage and end screen both carried "Upcoming features" and "Polish & fixes" sections. Some of it had shipped months earlier: the end screen still advertised "Notes for revising topics" as upcoming, and the homepage still said notes were *"Three modules are ready; eight more on the way"* when all eleven landed in v0.3.4. Both sections are gone from both surfaces, and the surviving "What's new" copy is corrected.

### Changed

- **Version renumbered `0.4.0` → `0.1.4`.** A deliberate step backwards, at Aasif's request, to restart the beta on an `0.1.x` line that increments by patch each release. Version strings are display-only here (a footer line and `package.json`; nothing is published to a registry), so the one-time non-monotonic step has no consumers to break. Ordering is well-behaved from here on, `0.1.100` included.
- **Buttons, CTAs and inputs are rounded.** Everything now uses a shared `--radius-cta` of 14px, matching the continuous 14pt corner on iOS's `WonkPrimaryButton`. Previously the site mixed sharp rectangles with Tailwind's default 4px `rounded`. Header nav and the appearance switch stay fully round (999px) — chrome and content keep distinct shape languages, as they do on iOS.
- **Neutral greys realigned to the iOS values.** The web greys were cool and blue-tinted (`#4B5563` / `#9CA3AF`) while iOS used neutral ones, so the two builds read as different products side by side. `--color-text-muted` moving to `#6B6B6B` also lifts it from roughly 2.5:1 on white, which fails WCAG AA, to about 5.1:1.
- **Notes surfaces routed through the palette tokens.** `notes/index.astro`, `notes/[module]/index.astro`, and `NoteLayout.astro` were still on raw Tailwind greys (33 occurrences), which would have rendered near-black text on a near-black ground once dark mode landed. Includes the runtime `classList` swap in the notes index that toggles a module title between locked and unlocked.
- **Ask Your Professor is one professor, not three.** Clicking the lifeline used to open a "Who do you want to call?" chooser; it now goes straight through in a single click. The panel names **Professor Takshi**, a fictional composite voiced from the economics persona (comparative advantage, regressions, dry self-deprecation) — the UI deliberately names no real faculty member, `displayName` is the only field that renders, and the persona source moved to an internal `_personaSource`. `ExpertPicker` is deleted from `Lifelines.jsx`; Nithen and Pranai move to `experts.json` `_archive` with their authored `correct` pools intact, so restoring a wider roster is a move-and-ship rather than a re-write. Homepage and in-game rules copy updated from "three AI characters" to one.
- **Lifelines unlock at Q6 instead of Q1.** New `canUseLifelines(state)` / `LIFELINE_UNLOCK_RUNG` in `gameEngine.js`, mirroring the existing `canWalkAway` threshold — both now gate on clearing the first safety net at Q5. Offering three single-use lifelines on an easy-tier Q1 invited players to burn them where they were worth least. The buttons render disabled before Q6 with an inline "Lifelines unlock at Q6. The easy tier is yours alone." Enforced in the `GameContainer` handlers too, not just the UI.
- **Auth flow redesigned as one surface.** New `AuthLayout.astro` gives `/login`, `/auth/confirm`, `/onboarding/nickname`, and `/onboarding/avatar` a shared centred masthead (hairline uppercase eyebrow over a large Playfair headline) and vertically centres them in `<main>`'s content box, closing the dead gap that stranded these short pages at the top of an 80vh region. `/login`'s benefit lists are demoted to fine print so the two entry buttons carry the page. Type and palette are unchanged — the tokens are fixed, and the redesign works in scale, alignment, and whitespace only.
- **Header restyled.** "Sign in" was underlined teal text sharing no shape language with the outlined nav pills beside it; it is now a filled charcoal pill (outlined nav vs. filled action), and the auth slot has a reserved `min-height` so it no longer reflows the header when `/api/me` resolves. The wordmark is two-tone — charcoal "Policy", teal italic *Wonk* — matching the homepage hero treatment in `index.astro`.
- **Palette drift repaired.** `onboarding/nickname.astro` and `onboarding/avatar.astro` were using raw Tailwind greys (`text-gray-500`, `border-gray-400`, `bg-black`, `bg-red-50`) instead of the palette tokens, so they drifted off-theme as the tokens changed. All routed through the `global.css` vars.

### Fixed

- **Sign-in works again in production — email provider swapped from Resend to Brevo (#51).** Resend's free tier verifies exactly **one** sending domain per account, and that slot is held by an unrelated project, so `policywonkgame.aasifj.com` could never be verified there: every magic-link send was rejected and `/api/auth/send-link` failed silently behind its deliberately generic 200. The whole member tier was down. Cloudflare Email Sending was evaluated and rejected — it requires the Workers Paid plan. **Brevo** replaces it: the free tier allows multiple verified sender domains at 300 emails/day. `_lib/email.ts` now posts to `https://api.brevo.com/v3/smtp/email`, which differs from Resend in three ways worth knowing — a bare `api-key` header rather than a `Bearer` token, `sender`/`htmlContent`/`textContent` field names, and `201` on an accepted send. `sendEmail()` keeps its old signature, so callers were untouched. Env vars renamed `RESEND_API_KEY` → `BREVO_API_KEY` and `RESEND_FROM` → `EMAIL_FROM`; the sender address itself is unchanged at `noreply@policywonkgame.aasifj.com`. Shipped alongside the out-of-repo setup this depends on: the sending domain authenticated in Brevo (Brevo code + two DKIM CNAMEs + a subdomain DMARC record, all added to the `aasifj.com` Cloudflare zone as DNS-only), and `BREVO_API_KEY` set for **both** the production and preview Pages environments. The API key is deliberately set to **no expiry** — a key that lapses on a date would reproduce exactly this class of silent outage. Note that Brevo separately expires keys after 90 days of *inactivity*, which is a real risk for a low-traffic magic-link app; #53's smoke test doubles as the keep-alive.
- **Duplicate sign-in affordances.** `/play` rendered a "Log in →" button directly beneath the site header's "Sign in" — the same action twice, in two styles, with two different words for it. The `/play` strip (from #19) is removed; the site-wide header (#36) already covers every page, and dropping it also removes a duplicate `/api/me` request per page load. The header's guest button is additionally suppressed on `/login`, `/auth/confirm`, and `/onboarding/*`, where the page body *is* the sign-in surface.
- **Lifelines now fail loudly on a salt/payload mismatch.** `findCorrectIndex` returns `-1` when no option hashes to the question's `correctHash` — which happens when the bundled salt and the question JSON come from different builds (the salt rotates every build). All three lifelines derived their output from that index and corrupted silently rather than visibly: the professor recommended "Option undefined" (`["A","B","C","D"][-1]`), 50:50 filtered nothing and could therefore **eliminate the correct answer**, and the poll wrote its majority share to `result[-1]`. The handlers now log a specific console error and leave the lifeline unspent (restoring the timer) rather than handing the player confidently wrong advice.

### Pending

- Re-author CP 22 / CG 1 / CP 10 notes through the proper `scripts/ingest.js` pipeline using the actual GCPP source PDFs. Current notes were authored from question-bank explanations + general public-policy knowledge (sub-agent couldn't reach the source PDFs). See [`CONTRIBUTING.md`](policy-wonk-game/CONTRIBUTING.md) for the pipeline. The 92 build warnings about missing `<slug>.md` files all come from these three modules — they collapse once the re-authoring lands.
- Pixel-letter render surface for avatars — `avatar_slug` is stored at signup but no UI displays it yet. When `/me` or in-game avatar lands, drop in a pixel font (e.g. Press Start 2P) and render the letter.
- Pre-launch checklist update — add an end-to-end signup smoke test against **both staging and production** so missing D1 migrations / unset secrets surface before any real user (or the admin) hits them. (Phase 1 launched with prod D1 unmigrated; v0.3.0 hit the same trap on staging during admin-panel QA.)
- Per-email magic-link rate limit feels tight (3 per 15 min, silent block). Consider raising to 5–8 per 15 min or surfacing a visible "you've requested several links; check spam or wait a few minutes" message.
- Option-length variance across several question banks (cs-11, cp-33 and others) — the build flags ~30 questions where the correct option is meaningfully longer than its distractors. A "longest = correct" tell. Tighten the bank when there's appetite.

## [0.4.0] — 2026-06-06 — Ask Your Professor, share + OG tags, real 404, privacy-respecting analytics

A four-issue bundle: a richer lifeline, social sharing, an honest 404, and first measurement — shipped together. Closes #39, #3, #1, #12.

### Added

- **Ask Your Professor ✨ (#3).** The "Ask an AI" lifeline is renamed and rebuilt. Three professor caricatures (Nithen / Pranai / Anoopam) now give a short in-character lecture and *then* the answer — and the answer is **always correct** (the old reliability roll and wrong/useless pools are retired, preserved under `_archive`/`_deprecated` in `experts.json`). Each has a signature: Nithen frames it as the Trolley Problem (ethics), Anoopam reaches for the Virat Kohli comparative-advantage bit (economics), Pranai stacks frameworks then lets the serious mask slip. The fourth expert (Saarthak) is dropped. `lifelineLogic.expertVerdict` now always returns the correct option.
- **Native share + Open Graph (#1).** End screen gains WhatsApp / X / LinkedIn share targets alongside the existing native `navigator.share`. `BaseLayout.astro` emits Open Graph + Twitter Card meta (absolute URLs from `Astro.site`) so pasted links unfurl. *Follow-up:* `/og-image.png` (1200×630, on-palette) still needs designing — the card unfurls without an image until then.
- **Real 404 page (#39).** `src/pages/404.astro` → `dist/404.html`, which Cloudflare Pages serves with a true HTTP 404 for unknown paths instead of falling through to the homepage with a 200. Verified with `wrangler pages dev`.
- **Privacy-respecting analytics (#12).** Cookieless **Cloudflare Web Analytics** beacon in `BaseLayout` (gated on `PUBLIC_CF_BEACON_TOKEN`, so nothing loads until configured) for traffic. CF Web Analytics has no custom-event API, so the quiz funnel (`game_started` / `module_chosen` / `game_completed`) is logged **first-party** via `POST /api/events` → **Cloudflare Workers Analytics Engine** (`EVENTS` binding). No PII, no cookies, no cross-site tracking; inputs are strictly allowlisted server-side.

### Changed

- **End-screen notes link is gated on real note existence (#39).** The question-bank `topic` slug doesn't always have a 1:1 note file (kebab-mismatches on cg-1 / cp-10 / cp-22). When the exact note is missing the link degrades to the module index; when a module ships no notes it renders nothing — never a dead link. cp-22 had **29 of 36** topics dead-ending before this.
- **Privacy copy reconciled with reality (#12).** `privacy.astro`, `EndScreen.jsx`, and `login.astro` now honestly disclose the cookieless beacon and anonymous first-party events, with a new "What we measure" section — replacing the absolute "no analytics, no third-party scripts" claims.
- Homepage and end-screen "upcoming features" teasers dropped the now-shipped "Smarter Ask a Professor" item.
- Footer version: `Beta v0.3.8` → `Beta v0.4.0`. `package.json`: `0.3.8` → `0.4.0`.

### Deploy notes

- **#12 needs Cloudflare dashboard setup to go live:** set `PUBLIC_CF_BEACON_TOKEN` (Pages env, Production + Preview) from Web Analytics, and confirm **Workers Analytics Engine** is enabled on the account (the `EVENTS` binding in `wrangler.toml`). Until then the beacon is absent and `/api/events` no-ops gracefully — no errors, no broken deploy.

## [0.3.8] — 2026-05-23 — Shorter, direct names for the three econ modules

Follow-up to v0.3.6. The "Public economics (incentives)" / "Public economics (markets)" / "Microeconomics (demand & supply)" framing was an organisational umbrella, not a tight content descriptor — these modules cover incentives, market processes (Hayek-style), and demand/supply mechanics respectively, not the formal public-economics canon (taxation, public goods, etc.). The umbrella label was adding jargon without adding clarity.

### Changed

- **`src/data/modules.json`** — three `name` field renames:
  - CP 21: `Public economics (incentives)` → `Incentives`
  - CP 22: `Public economics (markets)` → `Markets`
  - CP 23: `Microeconomics (demand & supply)` → `Demand & Supply`
- **78 notes frontmatter `moduleName` fields** updated to match (cp-21: 38, cp-22: 9, cp-23: 31).
- **3 `_index.md` files** — `title:` field and H1 updated.
- Comment in `src/content/config.ts` updated to the new example.
- Footer version: `Beta v0.3.7` → `Beta v0.3.8`. `package.json`: `0.3.7` → `0.3.8`.

## [0.3.7] — 2026-05-23 — Drop GCPP module codes from public UI

Companion to v0.3.6. After the four renames landed, the GCPP module codes (`CP 10`, `CP 11`, `CG 1`, `CS 11`, etc.) were still showing as visual labels next to each module name on the public UI. The codes are Takshashila-internal syllabus numbering and don't help non-Takshashila readers — same logic as the v0.3.6 renames.

### Changed

- Module picker (`GameContainer.jsx`) — dropped the `font-mono` code span; just the module name now.
- Notes index (`/notes/`) — dropped `{m.code} · ` from both locked and unlocked module cards.
- Per-module notes header (`/notes/<module>/`) — dropped `{mod.code} · ` from the uppercase rubric line; now shows just the group ("Foundations" / "Economic Reasoning" / "Strategy & Society").
- The codes remain in `src/data/modules.json` for any future internal cross-reference.
- Footer version: `Beta v0.3.6` → `Beta v0.3.7`. `package.json`: `0.3.6` → `0.3.7`.

## [0.3.6] — 2026-05-23 — Rename four modules to broader, field-standard names (closes #46)

Some module names in the GCPP-syllabus framing were Takshashila-internal coinage rather than standard policy/economics phrases (`Public Systems Thinking`, the `Public Economics — Incentives` / `— Markets` split, `Microeconomics — Demand & Supply`). They landed fine with Takshashila alumni but read as bespoke to a broader policy audience.

### Changed

- **`src/data/modules.json`** — four `name` field renames:
  - CP 10: `Public Systems Thinking` → `Systems thinking for policy`
  - CP 21: `Public Economics — Incentives` → `Public economics (incentives)`
  - CP 22: `Public Economics — Markets` → `Public economics (markets)`
  - CP 23: `Microeconomics — Demand & Supply` → `Microeconomics (demand & supply)`
- **88 notes frontmatter `moduleName` fields** updated to match (cp-10: 10, cp-21: 38, cp-22: 9, cp-23: 31).
- **4 `_index.md` files** in the affected modules — `title:` field and H1 updated to match.
- Comment in `src/content/config.ts` (uses module name as example) — updated for tidiness.
- Internal module IDs (`cp-10`, `cp-22`, etc.) and URL slugs are unchanged. No broken bookmarks; saved sessions and module-played tracking continue working since they reference IDs, not names.
- The 7 other modules are already field-standard names and were not touched: State Capacity, Policy Analysis, Trade & Specialisation, Culture & Society, Policy Communication, Strategic Studies, Politics & Society.
- Footer version: `Beta v0.3.5` → `Beta v0.3.6`. `package.json`: `0.3.5` → `0.3.6`.

## [0.3.5] — 2026-05-23 — Hotfix: drop the Phase-1 modules allowlist on the notes index

The notes index page (`/notes/`) hardcoded a Phase-1-era allowlist of three modules (`cp-22`, `cg-1`, `cp-10`) and rendered everything else as "Coming soon" — even after v0.3.4 shipped notes for all 11 modules. Surfaced moments after the v0.3.4 deploy went live.

### Fixed

- **`src/pages/notes/index.astro`**: removed the `AVAILABLE_MODULES` constant entirely. A module is now treated as available iff it has at least one entry in the content collection (`modulesWithNotes`). All 11 modules now read as unlockable on the notes index.

### Changed

- Footer version: `Beta v0.3.4` → `Beta v0.3.5`. `package.json`: `0.3.4` → `0.3.5`.

## [0.3.4] — 2026-05-23 — cs-11 notes + cross-module topic reconciliation (closes #40)

Closes #40 — every module on the site now has a 1:1 note file per `topic` in its question bank. Also retro-fixes a data-quality issue that shipped with v0.3.3: four modules (cs-11, cp-23, cp-25, cp-33) had `topic` fields in mixed Title-Case + kebab-case for the same concepts, which produced duplicate / broken note routes.

### Added

- **35 new revision notes for `cs-11` (Strategic Studies)** — `_index.md` plus 34 topics. Authored from the proper PDF pipeline (the three foundational PDFs — *Strategic Studies and the Problem of Power*, *Strategy and Limitation of War*, *The Lost Meaning of Strategy* — are scanned/image-only and needed an OCR pass via `ocrmypdf` before `scripts/ingest.js` could extract anything useful from them). The two pre-existing text-layer PDFs (Prakash Menon's CS-1 deck, the IWP Statecraft text) carry the rest. Sub-agent authored.
- **`Protectionism.md` route now exists in cp-25** — v0.3.3 shipped only `protectionism.md` (kebab) but the bank had topic `"Protectionism"` (Title Case), so that route was broken (it 404'd on Cloudflare Pages). The Title-Case file now exists and routes.

### Changed

- **Question banks**: cs-11.json (10 topic-field edits — 8 case-pair collapses + 2 kebab-orphan renames to `Strategy and Politics` and `Second-Strike Capability`), cp-23.json (6 edits), cp-25.json (6 edits), cp-33.json (9 edits). All `topic` values are now Title-Case across the entire site, with one note file per topic.
- **Six existing notes were merged** to absorb the kebab-side content their now-collapsed pair partners had been carrying: `cp-23/Market Equilibrium.md`, `cp-25/Comparative Advantage.md`, `cp-25/Trade Policy.md`, `cp-33/Narrative Structure.md`, `cp-33/Digital Platforms.md`, `cp-33/Credibility and Trust.md`. Each absorbed an analytical/applied angle that the kebab file had been a separate file for. No content was lost.
- **Ten notes were case-renamed** kebab → Title Case to match the reconciled bank values, with frontmatter `title` and body H1 updated to match. Affected: cp-23 (3 — `Price Controls in Crisis`, `Supply and Demand in Practice`, `Ceteris Paribus in Market Analysis`), cp-25 (2 — `Protectionism`, `Trade Liberalization`), cp-33 (5 — `Narrative Framing`, `News Cycles and Corrections`, `Deborah Stone Policy Paradox`, `Communication Strategy`, `Consultation Design`).
- Footer version: `Beta v0.3.3` → `Beta v0.3.4`. `package.json`: `0.3.3` → `0.3.4`.

### Notes coverage milestone

All 11 modules now ship with full revision-notes coverage: cg-1, cp-10, cp-11, cp-12, cp-13, cp-21, cp-22, cp-23, cp-25, cp-33, cs-11. (The three modules authored from the question-bank shortcut — CP 22 / CG 1 / CP 10 — are still flagged in `[Unreleased]` for re-authoring through the PDF pipeline, but that's a quality upgrade rather than a coverage gap.)

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
