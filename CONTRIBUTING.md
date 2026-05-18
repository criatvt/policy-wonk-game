# Contributing

Policy Wonk is open source under CC BY-NC 4.0. This doc explains the development workflow so future-you (or new contributors) don't have to reverse-engineer it.

## Source of truth

- **Open work** lives in [GitHub Issues](https://github.com/criatvt/policy-wonk-game/issues).
- **Phasing** lives in [`ROADMAP.md`](./ROADMAP.md). To see the current phase's issues:
  ```sh
  gh issue list -l phase-1
  ```
- **Non-negotiable rules** (style, originality, gating) live in `../CLAUDE.md` (outside this repo, in the project parent folder).

## Branching model

Two long-running branches:

| Branch | Purpose |
|---|---|
| `main` | The live deployment (`policywonkgame.aasifj.com`). Untouched between phase launches. |
| `phase-N` | Integration branch for the active phase (`phase-1`, eventually `phase-2`, …). |

Per-issue work happens on short-lived **feature branches off the active phase branch**:

```
main
 └─ phase-1
     ├─ feat/15-backend-setup
     ├─ feat/16-magic-link
     └─ feat/13-cp22-notes
```

### Workflow per issue

1. **Branch off the phase branch:**
   ```sh
   git checkout phase-1
   git pull
   git checkout -b feat/<issue-number>-<short-slug>
   ```

2. **Build it locally.** Test with `npm run dev` (and `wrangler dev` for backend work, once that lands).

3. **Open a PR into the phase branch** (not `main`). Reference the issue in the body:
   ```
   Closes #15
   ```

4. **Use the Cloudflare Pages preview URL** that auto-builds on the PR to test live.

5. **Self-merge** when satisfied. The issue auto-closes.

### Launch event

When every issue with the `phase-N` label is merged into `phase-N` and the preview URL passes the exit criteria in `ROADMAP.md`, open one PR: `phase-N` → `main`. Merging it is the launch.

### Hotfixes during a phase

If a typo or broken question needs to land on `main` mid-phase:

1. Branch off `main`: `git checkout -b fix/<slug> main`
2. Fix, PR into `main`, merge.
3. Rebase the phase branch on top:
   ```sh
   git checkout phase-1
   git rebase main
   git push --force-with-lease origin phase-1
   ```

Use `--force-with-lease`, never plain `--force`.

## Local development

```sh
# from policy-wonk-game/policy-wonk-game/
npm install
npm run dev              # Astro dev server
npm run build && npm run preview   # full build + preview
```

Once the Workers backend (issue #15) lands:

```sh
npm run dev:worker       # wrangler dev for the Worker
```

### Local auth bypass

`functions/api/_routes/auth.ts` exposes `/api/auth/dev-login?email=<addr>` when `ENV === "dev"`. It bypasses the magic-link flow and issues a real session cookie. Use it for local testing instead of wiring up a Resend key. The route returns 404 in preview/production. Add `?format=json` to keep a JSON body for curl; the default is a redirect through the onboarding chain.

`SESSION_SECRET` for the JWT signer lives in `.dev.vars` (gitignored). Generate one with any random string ≥ 32 chars.

## Commit conventions

- Imperative subject, ~50 char max.
- Optional body explaining *why* (the *what* is in the diff).
- Footer:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```
  if Claude Code helped author the change.

Examples from the existing log:
- `Phase 5: game engine core — playable end-to-end`
- `Editorial design overhaul: type, color, layout, copy, license`
- `Remove leftover host portrait PNGs from public/`

## Cloudflare environments

Once the backend lands, the project uses three environments:

| Environment | Branch | Database | Email |
|---|---|---|---|
| `prod` | `main` | `policy-wonk-prod` | Real Resend sends from `noreply@policywonkgame.aasifj.com` |
| `staging` | `phase-N` | `policy-wonk-staging` | Stubbed or routed to a single test inbox |
| `dev` | local | `wrangler dev` SQLite | Bypassed via `/api/auth/dev-login` |

Never let preview environments write to `policy-wonk-prod` or send real magic-link emails.

## Questions

Open a [GitHub Issue](https://github.com/criatvt/policy-wonk-game/issues/new). For sensitive matters, email aasif@aasifj.com.
