# Working on Policy Wonk

Operational rules for Claude Code sessions in this repo. Read this first; it
takes precedence over inferring conventions from the surrounding code.

Longer-form docs: [`CONTRIBUTING.md`](./CONTRIBUTING.md) (workflow, local
backend setup, notes pipeline), [`ROADMAP.md`](./ROADMAP.md) (phasing),
[`CHANGELOG.md`](./CHANGELOG.md) (what shipped when).

## Branching — never commit to `main`

Two branches, and `main` is protected (GitHub rejects a direct push):

| Branch | Rule |
|---|---|
| `main` | Production. Only moves via a merged `dev` → `main` PR. Merging **is** the deploy — Cloudflare Pages builds `main` to `policywonkgame.aasifj.com`. |
| `dev` | Integration. Everything lands here first. Cloudflare auto-builds a preview URL for it. |

Small change: commit straight to `dev`. Anything larger: `feat/<slug>` off
`dev`, merged back into `dev`. Either way, production is a separate deliberate
`dev` → `main` PR.

## Release checklist — the version lives in THREE places

When opening a `dev` → `main` PR (i.e. shipping to production), bump all three
or they drift apart:

1. `package.json` → `"version"`
2. `src/components/shared/Footer.astro` → the `Beta v0.1.4` string in the credit line
3. `CHANGELOG.md` → a new section for the release (move the relevant
   `[Unreleased]` entries into it)

Versioning is an `0.1.x` line that increments by **patch** each release
(`0.1.4` → `0.1.5`). Deliberate, per Aasif — see the v0.1.4 CHANGELOG entry.
Display-only; nothing is published to a registry.

**Remind Aasif of this checklist when a session is heading toward a release**,
and whenever a session's work is about to be merged to `main`.

## Design rules

The visual identity is deliberate. Do not drift it.

- **Always use the palette tokens** from `src/styles/global.css`
  (`var(--color-*)`) — never raw Tailwind greys (`text-gray-500`) or bare hex.
  Components read tokens so light/dark works with no `dark:` variants; a raw
  colour renders near-black-on-near-black in dark mode. This has regressed
  twice; check it.
- **Both themes, always.** Dark values are ported from the iOS app's
  `Theme.swift` and must stay in sync with it. Three states: `system` (no
  `data-theme` attribute), `light`, `dark`.
- `--radius-cta` (14px) for buttons/inputs/cards; 999px pills for header
  chrome. Matches iOS `WonkPrimaryButton`.
- **Hard nos:** purple / electric-blue gradients, spotlight-on-circular-stage
  framing, glossy gold chrome typography, resembling any specific TV game show.
- **Zero third-party runtime scripts.** This is a selling point in
  `package.json`'s description and on `/privacy`. Write it yourself rather than
  adding a dependency — `src/lib/confetti.js` is a canvas particle system for
  exactly this reason. (The only third-party script is the optional, cookieless
  Cloudflare Web Analytics beacon, gated behind an env var.)
- Type: Playfair Display (serif headlines) + Inter (body/UI). The hero's
  `Policy` roman / *Wonk.* italic split is intentional — leave it.

## Verify before claiming done

`npm run build` is necessary but not sufficient for UI work. Actually look at
the result: `npx astro preview` and screenshot it, in **both** themes. Several
issues this project has hit (raw greys in dark mode, notes index showing stale
"Coming soon", the header reflowing) all built cleanly and were only visible
on screen.

Note: Google Fonts may be unreachable from a sandboxed session, which makes
screenshots silently fall back to system fonts — don't mistake that for a
font change in the code.

## Gotchas

- `npm run dev` runs Astro only. The backend (`functions/`, Cloudflare Pages
  Functions) is a **separate runtime** — sign-in, saved history, notes-unlock
  and `/admin` need `npm run dev:worker`. A feature can look broken locally
  purely because it needs the Worker.
- The question banks in `src/data/questions/` are the authoring source.
  `scripts/transform-questions.js` hashes answers at build time; the correct
  index never ships to the browser. Run `npm run validate-questions` after
  editing a bank.
- Content lives in `src/content/notes/<module-id>/`, one file per question-bank
  `topic`, all Title-Case. Coverage isn't 1:1 yet; the end-screen link degrades
  to the module index rather than 404ing.
- Remote D1 migrations have been forgotten twice, breaking production and
  staging. If a change touches `migrations/`, say so explicitly in the PR.

## Licence

CC BY-NC 4.0. Keep the `LICENSE` file's Creative Commons line above the
copyright line, and keep the footer's licence link intact.
