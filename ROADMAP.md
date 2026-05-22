# Roadmap

This file phases the work after the open game shipped. The canonical, granular source of truth is **GitHub Issues**. This roadmap orders the work and explains the *why* per phase — it does not duplicate issue bodies.

To see live Phase 1 status:

```sh
gh issue list -l phase-1
```

Phase 2+ items are stack-ranked here but the ordering is **draft** — to be confirmed before each phase starts.

---

## Phase 1 — Notes + Accounts (frozen 2026-05-17, shipped 2026-05-19)

**Status:** substantially shipped. Tracks A, B, C complete; Track D (admin panel) deferred. See [`CHANGELOG.md`](policy-wonk-game/CHANGELOG.md#020--2026-05-19--phase-1-notes--accounts) for the per-feature summary and known issues.

**Goal:** unlock the learning loop. Players who get questions wrong can revise via notes; their progress saves across sessions if they log in. Guest play stays fully open and first-class.

**Why bundle:** notes give login a reason to exist; login gives notes a moat. Shipping notes open first and gating later would be a UX regression. Shipping login without notes leaves nothing to retain.

**Track A — Notes ✅**

| # | Issue | Status |
|---|---|---|
| #4 | Notes overview (parent) | ✅ Closed |
| #6 | Source-content extraction script | ✅ Closed |
| #7 | Cleaning + structuring script | ✅ Closed |
| #8 | Astro routes + content collection | ✅ Closed |
| #9 | Pagefind search | ✅ Closed |
| #10 | End-screen "Browse notes" link (gated: logged in + completed module) | ✅ Closed |
| #11 | Tighten `topic` validation | ✅ Closed |
| #13 | Write notes for 3 lead modules (CP 22, CG 1, CP 10) | ✅ Closed — see CHANGELOG known issues for provenance + re-authoring plan |
| #14 | Notes index page with per-module lock state | ✅ Closed |

**Track B — Accounts ✅**

| # | Issue | Status |
|---|---|---|
| #15 | Backend setup (Cloudflare Workers + KV/D1) | ✅ Closed |
| #16 | Magic-link login (Resend) | ✅ Closed |
| #17 | Signup flow (nickname + avatar) | ✅ Closed |
| #18 | Curated avatar set | ✅ Closed — shipped as 26 auto-derived letter slugs; pixel-letter render surface deferred |
| #19 | Play as Guest path | ✅ Closed |
| #20 | Guest-to-account merge on login | ✅ Closed |
| #21 | Saved session history | ✅ Closed |
| #22 | Module-played tracking | ✅ Closed |
| #32 | Skip in-game name prompt for logged-in users | ✅ Closed |

**Track C — Upsells + Docs ✅**

| # | Issue | Status |
|---|---|---|
| #23 | Pre-game login upsell | ✅ Closed |
| #24 | Post-game login upsell for guests | ✅ Closed |
| #25 | Privacy & data note at email collection | ✅ Closed |
| #33 | "Well played" copy cosmetic | ✅ Closed |

**Track D — Admin ✅**

| # | Issue | Status |
|---|---|---|
| #26 | Admin panel for user management + troubleshooting (read-only) | ✅ Shipped in v0.3.0 (2026-05-22) via PR #37. Read-only `/admin` gated by `ADMIN_EMAILS`; non-admins get a real 404. |

**Post-launch releases on `main`:**

- **v0.2.1** (2026-05-19, hotfixes): magic-link prefetcher loop fix via `/auth/confirm` intermediate page; prod D1 migrations finally applied; end-screen Share affordance (#35).
- **v0.3.0** (2026-05-22): Track D admin panel (#26).
- **v0.3.1** (2026-05-22): Site-wide top header with Notes menu, auth chip + sign-out (#36), homepage refresh.
- **v0.3.2** (2026-05-22): Header hotfixes (chip global styling, header Sign-in → direct flow, tagline disclosure).
- **v0.3.3** (2026-05-22): 219 revision notes for cp-11/12/13/21/23/33 plus cp-25 completion. #40 partial — cs-11 only module remaining.

**Pre-launch checklist debt:** v0.2.1 and v0.3.0 both shipped with missing remote D1 migrations (the former on prod, the latter on staging). Next pre-launch checklist needs an end-to-end signup smoke test against **both staging and production** environments to catch this class of issue before the first real user hits it.

**Frozen decisions for Phase 1:**

- **3 lead modules only at launch** — CP 22 (micro), CG 1 (governance), CP 10 (statecraft). Others "coming soon."
- **Notes gating** — login required + at least one completed quiz in that module (won / lost / walked away; bouncing mid-quiz doesn't count).
- **Login method** — magic link, not 6-digit code.
- **Guest play** — first-class entry option, `sessionStorage` only, no persistence across tab close.
- **Guest-to-account merge** — supported within the same browser session.
- **Workflow** — local-first development. Each piece must work end-to-end on the developer's machine before going to main. Phase 1 ships as one launch event.

**Exit criteria:**

- A new visitor sees "Log in / sign up" and "Play as guest" with equal prominence on entry.
- A guest can play a full module, share, and walk away without an account.
- A logged-in user who completes CP 22 sees per-wrong-answer "Browse notes" links on the end screen that work.
- A guest who logs in mid-tab has their just-played session merged into the new account; notes for that module unlock immediately.
- `/notes` is reachable; locked modules show "Play [module] to unlock" or "Log in to unlock" copy.

---

## Phase 2+ — Draft phasing (to be confirmed)

Everything below is **stack-ranked as a starting point**, not frozen. Confirm or rearrange before starting any phase.

### Phase 2 — Engagement (post-launch wins)

| Source | Item |
|---|---|
| #1 | Native share buttons (WhatsApp, LinkedIn, X) + Open Graph meta tags |
| (new) | Rename "Ask an AI" → "Ask a Professor" — quick label-only change, can be done earlier as a one-liner |

### Phase 3 — Learning loop deepens (all login-gated)

| Source | Item |
|---|---|
| (new) | Flashcards — auto-generated from missed questions + curated per module |
| (new) | Spaced repetition scheduler (SM-2 / FSRS-style daily review queue) |
| (new) | Adaptive re-quiz — replays weighted toward past misses |
| (new) | Weak-area dashboard / personal stats |

### Phase 4 — Gamification spine + identity evolution

| Source | Item |
|---|---|
| (new) | Credit-score system — the meta-currency that powers unlocks |
| (new) | Funny self-deprecating certificate with credit points (shareable) |
| (new) | Avatar naming (phase 2 of the avatar feature) |
| (new) | Score-gated avatar unlocks + special features |

### Phase 5 — Polish & host

| Source | Item |
|---|---|
| #3 | Smarter Ask-a-Professor — richer personas, tier-aware lines, portraits |
| #2 | Wonky host character design + wiring |
| #12 | Privacy-respecting web analytics |

### Later (no commitment)

| Source | Item |
|---|---|
| #5 | Mobile optimization |

---

## How this doc is maintained

- **Source of truth** is GitHub Issues with the `phase-1` (or future `phase-2`, `phase-3`, …) labels. This file orders and explains.
- **Update when** a phase closes, scope shifts, or the ranking changes.
- **One paragraph per phase** explaining the goal; bullet lists for issues. No long prose.
- **Don't duplicate issue bodies.** Link to issues for detail.

License: CC BY-NC 4.0.
