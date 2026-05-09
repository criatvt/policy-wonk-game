# Policy Wonk

A 15-question ladder quiz on public policy fundamentals, built on Takshashila GCPP study material.

**Play it:** [policywonkgame.aasifj.com](https://policywonkgame.aasifj.com)

For Takshashila Institution alumni, students of GCPP and PGP revising concepts, and anyone curious about public policy.

---

## What it is

You answer 15 multiple-choice questions of increasing difficulty, one module at a time. Three lifelines (50:50, Audience Poll, Ask an AI), two safety nets (Q5 and Q10), and the option to walk away from Q6 onwards. Top score: 1 crore credibility points.

No accounts. No tracking. No data leaves your browser.

## Run it locally

You'll need Node.js 18+ and npm.

```bash
git clone https://github.com/criatvt/policy-wonk-game.git
cd policy-wonk-game
npm install
npm run dev
```

Then open [http://localhost:4321](http://localhost:4321).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (transforms questions, then runs Astro) |
| `npm run build` | Production build (sanitises answers, builds, generates Pagefind search index) |
| `npm run preview` | Preview the production build locally |
| `npm run validate-questions` | Check authoring question banks against the schema |

## Project structure

```
policy-wonk-game/
├── src/
│   ├── components/
│   │   ├── game/             # Game UI: Question, Ladder, Lifelines, Timer, EndScreen, GameContainer
│   │   └── shared/           # Footer
│   ├── data/
│   │   ├── questions/        # Authoring question banks (one JSON per module)
│   │   ├── experts.json      # The four "Ask an AI" characters and their lines
│   │   └── modules.json      # Module list (id, code, name)
│   ├── layouts/              # Astro base layout
│   ├── lib/                  # Game engine, lifeline logic, expert picker, score formatting
│   ├── pages/                # Astro pages (homepage, /play)
│   └── styles/               # Tailwind + game-zone CSS
├── public/                   # Static assets served as-is
├── scripts/
│   ├── transform-questions.js  # Build pipeline — hashes correct answers, strips explanations
│   └── validate-questions.js   # Schema validator
├── astro.config.mjs
├── package.json
└── LICENSE                   # CC BY-NC 4.0
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

## Roadmap

**Upcoming features**

- **Wonky** — a host with quirky policy traits.
- **Smarter Ask an AI** — richer characters and sharper answers from the four AI experts.
- **Notes for revising topics** — curated notes from each module.

**Polish & fixes**

- **Mobile optimisation** — current build is desktop-first; touch-friendly layouts coming.

See [open issues](https://github.com/criatvt/policy-wonk-game/issues) for the full list.

## License

[CC BY-NC 4.0](./LICENSE) — share and adapt freely for non-commercial use, with attribution. Selling this work or substantial derivatives is not permitted.

## Credits

Built by [Aasif Iqbal](https://linkedin.com/in/aasifiqbalj), an alumnus of [The Takshashila Institution](https://takshashila.org.in). Question content drawn from the Takshashila GCPP course material.

If Policy Wonk helped you, consider taking a look at the [Takshashila PGP programme](https://school.takshashila.org.in/pgp).
