# Session Hand-off — Sector 42

> Written 2026-09-20. Purpose: let a fresh session pick up this project without re-deriving context. For full architecture, schema, and API details, see [`technical-blueprint.md`](./technical-blueprint.md) — this doc is a pointer/status layer on top of it, not a replacement.

## What this project is

Sector 42 is a hexar.io-style multiplayer territory-claiming web game: 8–10 players per match, tile-based map, PvP shooting, destructible structures, timed game phases. Server-authoritative, built with Colyseus (Node/TypeScript) and a React + Phaser 3 client (Vite, TypeScript).

Local path: `/Users/KC/Work/kenecaswell/sector-game/` (user's machine, linked via the device bridge). Not a git repo as of this session — no version control yet.

## Where things stand right now

**Playable core loop is implemented and verified:** join/lobby, movement, shooting, tile claiming, phase timers, destructible structures, reconnection. Verified via a live headless `colyseus.js` smoke test (join → decode state → send input → receive ack/broadcasts → observe reactive changes).

**This session's work (in order):**

1. **Game design expansion** — the user added six new design ideas to the plan. Two are implemented, four are documented as designed-but-not-built:
   - ✅ **Credits economy** — 1 credit per owned tile, paid out every 10s during claiming/combat phases (`EconomySystem`, server-side, wall-clock-timestamp driven like the existing `PhaseSystem`).
   - ✅ **HUD** — React overlay showing phase, countdown, own health/ammo/tiles/credits.
   - ✅ **Leaderboard** — React overlay, live-sorted by credits.
   - ✅ **Mobile controls** — hand-built virtual joystick (pointer events, no library) + a "Build" toggle button; feeds the same `{x, y}` input contract as keyboard, so no server/protocol changes were needed.
   - ⏳ **Teams** — designed, not implemented. Open questions flagged in the blueprint: tile-ownership model for teams (per-player vs. per-team), team formation UX, friendly-fire/structure-damage exemption mechanics.
   - ⏳ **Win condition / scoring** — designed, not implemented. Score = points-per-credit-unit + points-per-structure-type (city hall 1000, school 250, house 100, fort 25), match length 5–10 min (start with 5). Open questions: exact `pointsPerCredit` value, tie-breaking rule, decoupling match length from the existing phase system.

2. **Phaser game view built from scratch** — `GameScene` (single scene, no `PreloadScene`/`UIScene` split), rendering tiles/players/projectiles/structures with primitive shapes (no sprite assets yet), camera follow + position lerp, click-to-shoot / tap-to-build. HUD and Leaderboard are React overlays reading `GameContext`, not Phaser UI — this avoids duplicating Colyseus's reactivity inside Phaser. See blueprint §9 ("Client — Phaser Game") for the full rationale and structure.

3. **Server dependency-pinning bug, found and fixed** — the user hit a server build failure (`tsc` errors on `Room<RoomOptions>` / `onLeave(client, code?: number)`). Root cause: `@colyseus/core` is only a *peer* dependency of `colyseus`/`@colyseus/ws-transport` (both pinned to `0.16.x`), but something on the user's machine had installed it directly and unpinned, resolving to `0.18.14` — which has a breaking API (Colyseus changed `Room`'s generic meaning and the `onLeave` signature in `0.17`). **Fix:** pinned `@colyseus/core`, `@colyseus/schema`, `@colyseus/ws-transport`, and `colyseus` to exact versions (no `^`) in `server/package.json`, regenerated `package-lock.json` from a clean install, verified `npm run build`/`npm run lint` pass. Synced both files to the user's machine. **The user still needs to run `rm -rf node_modules && npm ci && npm run build` in `server/` to pick this up** — that had not been confirmed done as of this hand-off.

## Known operational gotcha (important for any file sync)

`mcp__remote-devices__device_commit_files` **can report `"written"` success while silently serving stale cached content** when called with `stagedPath` — this was caught mid-session when the user noticed a doc update hadn't actually landed (old file was still 53071 bytes locally vs. 69889 bytes in the container, even after a forced re-push to a new path). The reliable pattern, used for every sync since:

1. `SendUserFile` on the container-side file(s) → get back a `file_uuid` per file.
2. `mcp__remote-devices__device_commit_files` with `fileUuid` (not `stagedPath`).
3. `mcp__remote-devices__device_list_dir` on the destination folder to independently confirm byte size matches the container's local file size.

Skipping step 3 is exactly how the stale-cache bug went unnoticed the first time — always verify sizes after a sync that matters.

## Known gaps / not yet done

- **No visual/interactive browser verification of the Phaser view.** Everything was verified via TypeScript compilation, ESLint, and headless `colyseus.js` scripts against the data layer — nobody has actually opened the game in a browser and watched the tile grid render, tried the joystick, etc. Worth doing with a browser automation tool early in the next session.
- **Client bundle is ~1.7MB** (Phaser pushes it up) — a Vite build warning was shown but not addressed. Code-splitting is a future task.
- **No dedicated mobile fire button** — mobile shooting currently relies on tap-to-shoot on the game canvas, same as desktop click; a separate fire control may be worth adding.
- **No responsive layout tuning** for phone-width screens beyond the joystick itself being touch-friendly.
- **GameScene.ts is one file (~250 lines)** — fine for now, but flagged as a candidate to split into separate renderer modules if it keeps growing.
- **Not a git repo** — no version control has been set up for this project yet.
- **Teams and win-condition/scoring** — see open questions above; nothing implemented, schema not yet touched for either.

## Key files to know

- `docs/technical-blueprint.md` — the full architecture doc (also mirrored into the attached claude.ai Project at `claude/technical-blueprint.md`). Has a Decisions Log at the bottom worth reading for *why*, not just *what*.
- `server/src/systems/EconomySystem.ts` — credits payout logic.
- `server/src/rooms/GameRoom.ts` — room lifecycle, tick loop, system wiring.
- `client/src/game/scenes/GameScene.ts` — the Phaser rendering/input scene.
- `client/src/screens/GameScreen.tsx` — hosts the Phaser canvas + React overlays (HUD, Leaderboard, mobile joystick, build button).
- `client/src/context/GameContext.tsx` — Colyseus connection lifecycle, reconnection-token handling, reactive player-list state for React.
- `client/src/net/GameConnection.ts` — thin `colyseus.js` wrapper; has the version-compatibility warning comment at the top (do not bump client/server Colyseus versions independently — see blueprint §1).

## Suggested next steps

1. Confirm the user's `npm ci` picked up the pinned server versions and the build is green on their machine.
2. Do a real browser pass on the Phaser view (tile rendering, joystick feel, build-mode tap targets).
3. Decide the open questions for Teams and Win-condition/Scoring (flagged above and in the blueprint's Planned Features section), then implement whichever the user prioritizes next.
4. Consider setting up git — there's no version control yet, which is worth raising with the user given the project's size.
