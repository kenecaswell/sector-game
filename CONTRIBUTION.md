# Contributing to Sector 42

Thanks for your interest in Sector 42! Bug reports, ideas, docs fixes and code are all welcome. This guide explains how to get set up, what we expect from a change, and how to get it merged.

If anything here is unclear or out of date, opening an issue about it is a contribution too.

## Code of conduct

Be kind and assume good intent. Harassment, personal attacks and discriminatory language aren't tolerated in issues, pull requests or any other project space. Maintainers may remove comments or block contributors who don't follow this.

## Ways to contribute

- **Report a bug** — something broken, confusing or slow.
- **Suggest a feature** — new mechanics, shop items, UI improvements.
- **Improve the docs** — the [README](README.md), the [game design doc](docs/GAME_DESIGN.md) and the [architecture doc](docs/ARCHITECTURE.md).
- **Write code** — fix a bug or build something from the [planned features](docs/ARCHITECTURE.md#planned-features).

For anything larger than a small fix, please **open an issue first** to talk it through. The game is server-authoritative and a few choices are deliberate (see the decisions logs in the [game design](docs/GAME_DESIGN.md#design-decisions-log) and [architecture](docs/ARCHITECTURE.md#decisions-log) docs), so a quick conversation up front saves rework.

## Reporting bugs

Search existing issues first. If it's new, include:

- **What happened** and **what you expected**.
- **Steps to reproduce** — how many players/tabs, which phase (lobby, buying, playing, results), what you did.
- **Device and browser** — e.g. iPhone 15 / Safari, Windows / Chrome 128, and desktop vs. touch controls.
- **Logs** — the browser console output and, if you ran it locally, the **server** terminal output. Many client symptoms ("stuck on connecting…") are really server errors.
- **Performance problems** — press `` ` `` (backtick) in game to show fps, frame time, renderer and canvas size, and include those numbers.
- Your Node version (`node -v`) if the problem is with building or running locally.

Check the [Troubleshooting](README.md#troubleshooting) table first — some behaviour (like the dev server dropping players when a file changes) is expected.

## Suggesting features

Open an issue describing the problem or gameplay goal, not just the solution. Mention how it affects mobile players, since touch is a first-class input. Check the [open design questions and plans](docs/GAME_DESIGN.md#open-design-questions-and-plans) in case it's already being considered.

## Development setup

Follow the [Quick start](README.md#quick-start) in the README. In short:

1. Use **Node.js 22.13+** (the project is developed on Node 24).
2. Fork the repo and clone your fork.
3. Install each side separately — there is no root package:
   ```bash
   cd server && npm ci
   cd ../client && npm ci
   ```
4. Run `npm run dev` in `server/` and in `client/` (two terminals), then open http://localhost:5173.

Tip: `PHASE_TIME_SCALE=0.05 npm run dev` in `server/` runs a whole match in about 20 seconds, which is handy for testing phase changes and the results screen.

## Making changes

### Branches

Create a branch off `main` with a short descriptive name:

```
fix/reconnect-after-sleep
feat/armor-shop-item
docs/controls-table
```

Keep each pull request focused on one change. Unrelated refactors or reformatting belong in their own PR.

### Code style

- **Prettier** — 4-space indentation, single quotes, semicolons, 100-column lines (configured in `client/.prettierrc.json` and `server/.prettierrc.json`).
- **ESLint** — flat config in each folder; the client also enforces React hooks rules.
- Some older files are still 2-space indented. **Match the file you're editing** rather than reformatting it as part of an unrelated change. A formatting-only PR (`npm run format`) is welcome on its own.
- TypeScript everywhere; avoid `any` where a real type is practical.

### Things that are easy to get wrong

Please read these before touching the related code:

- **Two coordinate spaces.** The server simulates in flat top-down coordinates; the isometric look is only a client render transform. Read [Map — hex grid and coordinate spaces](docs/ARCHITECTURE.md#map--hex-grid-and-coordinate-spaces) before changing positions, movement or input.
- **Shared code lives in `shared/`.** Messages, catalogs, hex math, the sizes both sides must agree on and the synced state's shape are in one place, imported by both the server and the client (through their usual `types/shared.ts`, `hex.ts` and constants files, which re-export it). Keep `shared/` free of npm imports and decorators; `npm run lint` / `npm run format` in `server/` cover it.
- **Matching constants.** Hex and entity sizes in `client/src/game/constants.ts` must match `server/src/constants.ts`.
- **Server authority.** Clients send inputs; the server decides outcomes. Don't let the client decide hits, claims, credits or scores.
- **Pinned Colyseus versions.** `colyseus`, `@colyseus/core`, `@colyseus/schema` and `@colyseus/ws-transport` are pinned exactly in `server/package.json` because the only published client (`colyseus.js` 0.16.x) doesn't work with newer lines. Don't add `^` or bump them without discussing it in an issue first.
- **`useDefineForClassFields: false`** must stay in `server/tsconfig.json`, or the server crashes on the first join.

### Commit messages

Write commits in the imperative mood with a short summary line (about 72 characters or less), and a body explaining *why* when it isn't obvious:

```
Fix players spawning inside structures

Respawn picked the map center without checking for structures,
so a player could get stuck until they moved out.
```

Reference issues where relevant (`Fixes #12`).

## Before you open a pull request

There's no automated test suite yet, so these checks matter. In **each folder you changed** (`server/` and/or `client/`):

```bash
npm run build          # type-checks — `npm run dev` on the server skips this
npm run lint
npm run format:check   # or at least make sure the files you touched are formatted
```

Then **play it in a real browser**: start both sides, join from at least two tabs, and exercise what you changed. Several past bugs passed build and lint on each side and only showed up when a real client and server ran together.

If you changed dependencies, also run this in `server/` before testing:

```bash
rm -rf node_modules && npm ci && npm run build
```

If your change affects touch controls or layout, please test on a phone or with your browser's device emulation too (see [Testing on a phone](README.md#testing-on-a-phone-or-another-machine)).

When unit tests are added (Vitest is planned), new logic — especially server systems — should come with tests.

## Pull requests

1. Push your branch to your fork and open a pull request against `main`.
2. In the description, explain **what** changed and **why**, link the related issue, and describe **how you tested it** (browsers/devices, number of players).
3. Include a screenshot or short clip for visual or UI changes.
4. Update the docs in the same PR if behaviour changes:
   - the [README](README.md) for anything players or new contributors need to know (controls, scripts, configuration);
   - the [game design doc](docs/GAME_DESIGN.md) for changes to rules, numbers or controls — and add an entry to its decisions log for a deliberate gameplay choice;
   - the [architecture doc](docs/ARCHITECTURE.md) for architecture, protocol or state changes — and add an entry to its decisions log if you made a non-obvious technical choice.
5. A maintainer will review it. Please respond to feedback by pushing new commits to the same branch; we may ask you to squash before merging.

Don't worry about getting everything perfect on the first try — reviews are a conversation.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Questions

Open an issue with the **question** label, or start a discussion. Thanks for helping make Sector 42 better!
