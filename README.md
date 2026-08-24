# Policy Wonk

A 15-question ladder quiz on public policy fundamentals, built on Takshashila GCPP study material.

**Play it:** [policywonkgame.aasifj.com](https://policywonkgame.aasifj.com)

For Takshashila Institution alumni, students of GCPP and PGP revising concepts, and anyone curious about public policy.

---

## What it is

You answer 15 multiple-choice questions of increasing difficulty, one module at a time, across 11 topics spanning Foundations, Economic Reasoning, and Strategy & Society. Three lifelines (50:50, Audience Poll, Ask Your Professor), two safety nets (Q5 and Q10), and the option to walk away from Q6 onwards. Top score: 1 crore credibility points.

The game is fully open — no account needed to play. **Play as Guest** is a first-class entry alongside Sign in. Optional email + magic-link login (no passwords) unlocks the learning loop: revision notes per module (after you've completed a quiz on it), saved play history, nickname + avatar.

The site supports light, dark, and system-matched appearance (toggle in the header), and there's a native iOS build in open TestFlight testing — see the homepage for the invite link. The iOS app is a separate sibling repo; this repo is the web build only.

No tracking cookies, no third-party analytics scripts. A cookieless Cloudflare Web Analytics beacon and anonymous first-party funnel events are the only measurement, both off by default until explicitly configured. See [`/privacy`](https://policywonkgame.aasifj.com/privacy) for the full breakdown.

## Known issues

A few rough edges to be aware of (also tracked in [`CHANGELOG.md`](./CHANGELOG.md#unreleased)):

- The current revision notes for CP 22 / CG 1 / CP 10 were authored from question-bank explanations + general public-policy knowledge, not directly from the GCPP source PDFs. Disclosed in the notes footer; re-authoring through the proper ingest pipeline is on the follow-up list.
- Avatars are stored as letter slugs but the pixel-letter render surface isn't shipped yet.

## Run it locally

You'll need Node.js 18+ and npm.

```bash
git clone https://github.com/criatvt/policy-wonk-game.git
cd policy-wonk-game
npm install
npm run dev
```

Then open [http://localhost:4321](http://localhost:4321).

This gets you the game itself — quiz, lifelines, notes, search. It does **not** get you the backend: `npm run dev` runs the plain Astro dev server, and the site is a static build (`output: 'static'`) with the API living separately in `functions/` as Cloudflare Pages Functions. Sign-in, saved history, notes-unlock, and the admin panel need `wrangler pages dev` against a local D1 database instead — see [`CONTRIBUTING.md`](./CONTRIBUTING.md#local-development) for that setup, including a dev-only auth bypass so you don't need a real email provider key.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (transforms questions, then runs Astro) |
| `npm run build` | Production build (sanitises answers, builds, generates Pagefind search index) |
| `npm run preview` | Preview the production build locally |
| `npm run dev:worker` | Full build + `wrangler pages dev` — the backend included |
| `npm run validate-questions` | Check authoring question banks against the schema |

## Project structure

```
policy-wonk-game/
├── src/
│   ├── components/
│   │   ├── game/          # Game UI: Question, Ladder, Lifelines, Timer, EndScreen, GameContainer
│   │   └── shared/        # Header, Footer, ThemeToggle, SearchBar
│   ├── content/notes/     # Revision notes, one folder per module (Astro content collection)
│   ├── data/
│   │   ├── questions/     # Authoring question banks (one JSON per module)
│   │   ├── experts.json   # Professor Takshi's lecture pool
│   │   └── modules.json   # Module list (id, code, name, group)
│   ├── layouts/           # Astro base layout
│   ├── lib/               # Game engine, lifeline logic, confetti, share card, score formatting
│   ├── pages/             # Homepage, /play, /notes, /search, /login, /auth, /onboarding, /privacy
│   └── styles/            # Tailwind + game-zone CSS, light/dark palette tokens
├── functions/              # Cloudflare Pages Functions — the backend
│   ├── api/               # Auth, sessions, /api/me (Hono)
│   └── admin/              # Read-only admin panel, gated on ADMIN_EMAILS
├── migrations/              # D1 schema (users, sessions)
├── public/                # Static assets served as-is
├── scripts/
│   ├── transform-questions.js  # Build pipeline — hashes correct answers, strips explanations
│   ├── validate-questions.js   # Schema validator
│   └── ingest.js                # Notes-authoring pipeline (PDF → working content)
├── astro.config.mjs
├── wrangler.toml           # Cloudflare Pages + D1/KV bindings, per environment
├── package.json
└── LICENSE                # CC BY-NC 4.0
```

## How the question banks work

Authoring files in `src/data/questions/<module>.json` contain plaintext questions, options, the correct answer index, and an explanation.

At build time, `scripts/transform-questions.js`:

1. Validates each authoring file against the schema.
2. Hashes the correct answer with a per-build salt.
3. Shuffles the options deterministically (same id always shuffles the same way).
4. Writes runtime files to `public/data/questions/<module>.json` containing **only** question text + options + a `correctHash`. No `correctIndex`, no explanation.
5. Writes explanations to a separate file, fetched only after the player locks an answer.

The deployed site never ships the correct answer to the browser unsanitised. This is casual obfuscation, not cryptography — anyone determined enough can read the authoring files in this repo. That's fine; the project is meant for learning, not gatekeeping.

## Spotted a bad question?

Below every explanation card after answer-lock, there's a small "Spot an issue with this question?" link pair — Email or GitHub issue. Both pre-fill the module and question id.

You can also [open an issue directly](https://github.com/criatvt/policy-wonk-game/issues/new).

## Contributing

Pull requests welcome. A few notes:

- Question banks live in `src/data/questions/`. If you spot an error, fix it there and run `npm run validate-questions` before committing.
- The visual identity (deep teal accent, Playfair + Inter type stack, white background, no purple/electric-blue) is intentional. Keep changes consistent.
- The project deliberately avoids resembling any specific TV game show. The 15-question ladder format is generic; specific show identities are not.
- **Branching:** work lands on `dev` first (directly, or via a short-lived feature branch merged into `dev`); `main` is production and only moves via a `dev` → `main` pull request. See [`CONTRIBUTING.md`](./CONTRIBUTING.md#branching-model) for the full workflow, including local backend setup.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for phasing rationale and the per-phase issue list. [`CHANGELOG.md`](./CHANGELOG.md) tracks what shipped in each release.

**Shipped since Phase 1** — the admin panel (`/admin`, read-only, gated on `ADMIN_EMAILS`), a site-wide header with search and an account menu, dark mode, native share + a matching share card, and the iOS build's open TestFlight beta.

**Still ahead**

- **Wonky** — a host character with quirky policy traits, deferred to v2/v3 after playtesting.
- **Smarter Ask Your Professor** — richer personas, tier-aware lines, portraits.
- **Mobile optimisation** — current build is desktop-first; touch-friendly layouts coming.

See [open issues](https://github.com/criatvt/policy-wonk-game/issues) for the full list.

## License

[CC BY-NC 4.0](./LICENSE) — share and adapt freely for non-commercial use, with attribution. Selling this work or substantial derivatives is not permitted.

## Credits

Built by [Aasif Iqbal](https://linkedin.com/in/aasifiqbalj), an alumnus of [The Takshashila Institution](https://takshashila.org.in). Question content drawn from the Takshashila GCPP course material.

If Policy Wonk helped you, consider taking a look at the [Takshashila PGP programme](https://school.takshashila.org.in/pgp).
