# Sector 42 — Architecture

> How Sector 42 is built: tech stack, protocol, state, server systems, client rendering, testing, status and technical decisions. **What the game is** — its rules, numbers and open design questions — is in [`GAME_DESIGN.md`](GAME_DESIGN.md).

---

## Start here

_For a new session or contributor. Last updated 2026-10-03 (structures with jobs: tile limit, Fabricator gate, Guard Tower; guns as a per-game setting, off by default; Create game switches; color picker; drawn structure art) — run `git log` for anything newer._

**What this is.** Sector 42: a real-time multiplayer territory-claiming game (hexar.io-style) with PvP shooting, destructible structures and fabrication (a shop, in code), 8–10 players per match on an isometric hex map. The **server is authoritative**: clients send inputs, the server simulates at 20 Hz and syncs state. Server: Node + TypeScript + Colyseus 0.16.5. Client: React 19 + Phaser 4, built with Vite.

**Read in this order.** `README.md` (run, build, lint, controls) → this section → `docs/GAME_DESIGN.md` for what the game's rules are → only the sections of this doc you need (it's long; search by heading) → the **Decisions Log** at the end for *why* things are built the way they are (gameplay decisions are logged in `GAME_DESIGN.md`). Hosting is planned separately in `docs/HOSTING.md`.

| If you're working on… | Read |
|---|---|
| The protocol, messages, state schema | Networking Layer, Game State Schema |
| Game rules and balance (phases, lobby, characters, teams, movement, shooting, score, shop, claiming) | `docs/GAME_DESIGN.md` for the rules; Game Mechanics here for how each is implemented |
| Terrain (generation, drawing, collision, Jetpack) | Game Mechanics → *Terrain*; `tools/map-preview.js` to see generated maps |
| Bots (computer players, single player, difficulty) | Game Mechanics → *Bots*; `tools/bot-sim.js` to tune them |
| Upgrades (levels, the one equipped slot, the inventory) | Game Mechanics → *Shop (the Upgrades tab)* (Upgrades bullet); Client — React Shell (Inventory) |
| The hex map, iso projection, coordinate spaces | Game Mechanics → *Map — hex grid and coordinate spaces* |
| Rooms, closing, reconnection, notices | Room Lifecycle, Reconnection System |
| Collisions, structures | Collision Detection, Destructible Structures |
| Client screens (lobby, HUD, Build menu, results) | Client — React Shell |
| Rendering, input, smoothing, performance | Client — Phaser Game, Testing → *Performance pass* |
| Testing and verification | Testing Multiplayer Locally, and `tools/README.md` |

**Verify after changes.** Server changes: `cd server && npm test && npm run lint`, then `npm run build && node ../tools/e2e.js` (Vitest unit specs next to the code; `e2e.js` runs real clients against a throwaway server — see *Server unit tests* under Testing and `tools/README.md`). Client changes: `cd client && npx tsc -b && npx eslint src && npm test` (Vitest unit and component tests, see *Client unit tests* under Testing), then look at it in a browser — nothing automated covers the Phaser canvas. `PHASE_TIME_SCALE=0.05` on the server shrinks every phase so a whole match runs in seconds.

**Shared code lives in `shared/`** (since 2026-09-26; before that, these were hand-copied between the two sides). One copy, imported by both:
- `shared/types.ts` — messages, events, and the catalogs (shop, teams, characters, structure/gun/upgrade names, player-name rules).
- `shared/hex.ts` — hex grid math and the structure footprint/hexagon.
- `shared/constants.ts` — `HEX_SIZE`, `PLAYER_RADIUS`, `PROJECTILE_RADIUS`, `SCREEN_Y_SCALE` (the client's `ISO_SQUASH` *is* this), `BASE_CLAIM_RADIUS`.
- `shared/projectiles.ts` — `projectileVelocity`, used by the server's `CombatSystem` and the client's extrapolation.
- `shared/state.ts` — the synced state's shape as plain interfaces. The server's schema classes `implement` them (all but `GameState`'s four collections, which the compiler can't match structurally), so dropping or retyping a field the client reads is a compile error. A field the server *adds* isn't flagged; add it to the interface when the client needs it.

Each side keeps its usual import paths: `server/src/types/shared.ts`, `server/src/hex.ts`, `server/src/constants.ts`, `client/src/types/shared.ts`, `client/src/types/gameState.ts`, `client/src/game/hex.ts` and `client/src/game/constants.ts` re-export `shared/` and add only what's theirs (the server's structure collision code, the client's isometric projection and render constants). **Rules for `shared/`:** plain TypeScript with no npm imports (it has no `node_modules`); type-only imports use `import type` (the client compiles it with `verbatimModuleSyntax`); nothing that needs decorators. How it's wired: the server's `tsconfig.json` has `rootDir: ".."` and includes `../shared`, so the compiled server is at `server/dist/server/src/index.js`; the client's `tsconfig.app.json` includes `../shared` and `vite.config.ts` allows the dev server to read `..`; `npm run lint` / `format` in `server/` also cover `shared/` (ESLint runs from inside `shared/` through its one-line `eslint.config.mjs`).

**Gotchas learned the hard way.**
- Pin all four Colyseus packages exactly and keep `useDefineForClassFields: false` in `server/tsconfig.json`; a client/server version mismatch or a missing flag shows up only when a real client joins (see Tech Stack).
- Node 20.19+/22.13+/24+ is required; the shell default may be too old.
- `npm run dev` on the server restarts on any file change and **drops every room**.
- `client/tsconfig.node.json` must stay type-check only (`noEmit`). It used to emit `vite.config.js`/`.d.ts` next to `vite.config.ts`, and Vite loads a `vite.config.js` *first*, so config edits were silently ignored until `tsc -b` regenerated it. Those files are now git-ignored (2026-09-26).
- Every room gets a **random map**, so an e2e check that walks far can be stopped by a mountain: such scenarios run with `TERRAIN_COVERAGE=0` (see `tools/README.md`). Every spawn area is always clear.
- In e2e checks, **wait for state, not for a message plus a sleep**: Colyseus sends broadcasts at once but state changes on the next 50 ms patch, which caused a ~1-in-10 flake.
- Test on private ports (server `PORT=2599`, client `VITE_SERVER_URL=ws://localhost:2599 npx vite --port 5199`) and don't touch 2567/5173 — the developer often has their own dev server running. The browser test pane is throttled and its screenshots lag; techniques for working around that are in the Testing section.

**Working agreements** (also in `CLAUDE.md`): the developer runs all git commands themselves (ask them to commit); 4-space indentation; in the same change, update this doc for technical changes, `docs/GAME_DESIGN.md` for rule or balance changes, and the README for user-facing changes, with a Decisions Log row in the matching doc for deliberate choices.

**Current state.** Playable end to end: start screen (Play) → game list (create a game with its settings, or join one by list, code or `/game/CODE` link) → ready-up lobby (name, team color, one of 5 characters) → 3 s countdown → 5 min play → results screen. In play: hex movement; claiming; shooting (once you have a gun); structures (7-hex footprint) from your character's kit or the shop; teammates (no friendly fire); score and materials; a shop of guns, ammo, upgrades and structures; **upgrade levels** (Booster, Harvester and Armor to level 3, Jetpack) with **one equipped slot upgrade**, switched in the **inventory** (`I`); a **randomly generated map** per match with mountains, lakes and rivers (solid unless you have Jetpack, unclaimable, mountains stop shots); disconnect/reconnect with notices; **bots** (computer players, Easy/Medium/Hard, added in the lobby), so the game can be played alone; a **5 s respawn delay**, with your gun, ammo and upgrades dropped in a **backpack** only you can see. See *Current Status & Known Issues* for the verified list and open bugs. **Temporary or placeholder** (see Planned Features #2, #3, #7, #9): all numbers are first-pass and unbalanced; the power plant has no job yet (farms give a tile limit, fabricators unlock the Fabricator, Guard Towers shoot; per-type points, health and cost live in `STRUCTURE_SPECS`); everything is placeholder art (colored hexes, slabs, circles); the results screen is basic; team play is allies-only (no pooling, no team win).

**Suggested next steps** (a proposal, not a commitment — confirm priorities with the developer; the gameplay side of each is in `docs/GAME_DESIGN.md` → Open design questions):
1. **A job for the power plant**, and the tile-limit income deadlock (a player at their limit earns no materials; see GAME_DESIGN → Open design questions). Farms, fabricators and Guard Towers have jobs since 2026-10-03; the Blaster the towers fire is due a nerf (Planned Features #3).
2. **Balance pass:** ammo cap or supply, upgrade and character numbers, early-game pacing (nothing but ammo is affordable at the start), snowballing (#9).
3. **Art and sprites** (#7): terrain, structures, characters (six facings). Mountains and water have drawn graphics since 2026-09-29 (`game/terrainArt.ts`), and the four structures since 2026-10-03 (`game/structures/`); real sprite art could replace them. Custom lobby pickers (#10; the color picker is built, the character picker isn't).
4. **Spawn follow-ups:** the spawn line is in (2026-09-26); still open are teammates starting together, and the off-grid top-right corner (Known Issues → *Map corners*).
5. **Team follow-ups** (#2): pooling tiles/materials, a team win condition, team-size balancing.
6. **Server-side fire-rate limit**; client-side prediction (#8); off-screen player indicators.
7. **Test harness** for `GameRoom` and the client's `GameContext` (a fake room), which only `tools/e2e.js` and the browser cover today.
8. **Hosting** on AWS per `docs/HOSTING.md`.
9. Unresolved: a ~19 fps report on the developer's machine. Ask for the backtick readout (fps, ms/frame, renderer) — see Known Issues.

---

## Table of Contents

**New here? Read [Start here](#start-here) first.**

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Networking Layer](#networking-layer)
5. [Server — Colyseus](#server--colyseus)
6. [Game State Schema](#game-state-schema)
7. [Game Mechanics](#game-mechanics)
8. [Client — React Shell](#client--react-shell)
9. [Client — Phaser Game](#client--phaser-game)
10. [Room Lifecycle](#room-lifecycle)
11. [Reconnection System](#reconnection-system)
12. [Collision Detection](#collision-detection)
13. [Destructible Structures](#destructible-structures)
14. [Testing Multiplayer Locally](#testing-multiplayer-locally)
15. [Build Tooling](#build-tooling)
16. [Current Status & Known Issues](#current-status--known-issues)
17. [Planned Features](#planned-features)
18. [Decisions Log](#decisions-log)

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Server runtime | Node.js **20.19+ / 22.13+ / 24+ (developed on 24.21)** | Battle-tested, large ecosystem. TypeScript 6 and the current toolchain will not run on old Node — a shell defaulting to Node 13 fails `tsc` with `SyntaxError: Unexpected token '?'`. Run `nvm use 24` before building. |
| Server framework | Colyseus — exact pins: `colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5 | Built-in rooms, delta sync, reconnection. **All four are pinned without `^`** — see the pinning note below. |
| Server language | TypeScript (`~6.0.2`) | Shared types with client |
| Client framework | React 19 (`^19.2.8`) | Component-based UI shell (menus, lobby) |
| Client language | TypeScript (`~6.0.2`) | Type safety, shared types with server |
| Game rendering | Phaser 4 (`^4.2.1`) | 2D canvas, tile grid, particles, animations. (Earlier drafts of this doc said Phaser 3 / React 18 — the scaffold actually installed the newer majors.) |
| Client networking | `colyseus.js` `^0.16.22` | The only published client line; bundles `@colyseus/schema` 3.0.76 |
| Bundler (client only) | Vite | Fast HMR, zero-config TS + React. **Not used server-side** — the server builds with plain `tsc` and runs dev with `ts-node-dev`; Vite is a browser-facing dev server/bundler and doesn't apply to a Node backend. |
| Linting | ESLint 10 (flat config) + Prettier | Code quality and formatting, same toolchain shape for client and server |
| WebSocket protocol | Colyseus protocol (over ws) | Handles framing, delta compression |

> **Verified 2026-09-19, end-to-end:** client and server both build, lint, format-check, and boot cleanly against the dependency versions above, and a live client (`colyseus.js@0.16.22`) has successfully joined the server, decoded full state, sent inputs, received `inputAck`/broadcast messages, and observed reactive state changes. This required several rounds of correction from an earlier draft of this doc — see the Decisions Log for the full story (items 3–5 were found later, on 2026-09-20, when the app was first run in a real browser):
>
> 1. **The server was briefly on `colyseus@^0.18` / `@colyseus/schema@^5.0`, and no compatible client exists for that line.** `colyseus.js` (the published npm client) tops out at `0.16.22`, which bundles `@colyseus/schema@3.0.76`. A direct `curl` comparison of the two versions' `/matchmake/joinOrCreate/GameRoom` HTTP responses confirmed a genuine, previously-undocumented wire-protocol break: 0.18 returns a flat `{name, sessionId, roomId, processId}`, while the 0.16.x client expects a nested `{room: {...}, sessionId}` — this is **not** just a schema-decoding concern (which is reflection-based and more forgiving across minor versions), it's the matchmaking handshake itself. **Fix:** downgraded the server to `colyseus@0.16.5` + `@colyseus/schema@^3.0.76`, matching the only published client exactly. Do not bump either side independently without re-running a live join/decode test.
> 2. **After the downgrade, the server crashed on every client join** with `TypeError: Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')` inside `@colyseus/schema`'s encoder. Root cause: `tsconfig.json`'s `target: "ES2022"` makes TypeScript default `useDefineForClassFields` to `true`, which compiles class-field initializers (`id = '';` etc.) to `Object.defineProperty` semantics in the constructor. That silently **overwrites** the accessor that `@colyseus/schema`'s legacy `@type()` decorator installs on the prototype — the classic "class fields + legacy decorators" footgun. **Fix:** added `"useDefineForClassFields": false` to the server's `tsconfig.json` (see [Build Tooling](#build-tooling)) so field initializers compile to plain constructor assignments instead, letting the decorator's accessor actually run.
>
> 3. **`@colyseus/core` is only a *peer* dependency and must be pinned too (found 2026-09-20).** `colyseus` and `@colyseus/ws-transport` (both 0.16.x) declare `@colyseus/core` as a peer, so nothing forces a compatible version. An unpinned install resolved it to `0.18.14`, which broke `tsc` (`Room<RoomOptions>` generics and the `onLeave(client, code?: number)` signature changed in 0.17). It is now pinned to `0.16.26` alongside the other three packages, with `package-lock.json` regenerated from a clean install. After any dependency change, run `rm -rf node_modules && npm ci && npm run build` in `server/`.
> 4. **The committed `server/tsconfig.json` was missing `useDefineForClassFields: false` until 2026-09-20**, even though this doc described that fix as applied (item 2 above). The symptom was exactly the `Symbol.metadata` crash: the server logged it on every client join and never sent state, so the client sat on "connecting" forever. It is now in the file. If that crash ever reappears, check `tsconfig.json` first.
> 5. **`server/src/index.ts` had drifted back to the 0.18-style API** (`new Server({ express: (app) => … })` + `gameServer.listen()`), which does not exist in 0.16.5 and produced four `tsc` errors. Restored to the explicit `http.createServer` + `WebSocketTransport` form shown under [Server Entry Point](#server-entry-point-indexts), including the `Encoder.BUFFER_SIZE` bump.
>
> Where this doc's now-abandoned 0.18 draft assumed a different Colyseus API (`new Server({ server: httpServer })`, `Room<{ state: GameState }>`, and split `onDrop`/`onReconnect`/`onLeave(client, code)` hooks), everything below reflects the 0.16.5 API actually running and verified.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  CLIENT (Browser)                │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │         React Shell (UI Layer)           │   │
│  │  MenuScreen / LobbyScreen / ResultsScreen│   │
│  │           GameContext (Colyseus client)  │   │
│  └────────────────────┬─────────────────────┘   │
│                       │ passes room ref          │
│  ┌────────────────────▼─────────────────────┐   │
│  │       GameScreen (React component)       │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │         Phaser 4 Instance          │  │   │
│  │  │  GameScene: renders state, inputs  │  │   │
│  │  └────────────────────────────────────┘  │   │
│  │  React overlays: HUD, Leaderboard,       │   │
│  │  MobileJoystick, InventoryBar            │   │
│  └──────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────┘
                   │ WebSocket (Colyseus protocol)
┌──────────────────▼──────────────────────────────┐
│              NODE.JS SERVER                      │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │            Colyseus Server               │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │  GameRoom (per match)              │  │   │
│  │  │  - Authoritative state             │  │   │
│  │  │  - Tick loop (20Hz)               │  │   │
│  │  │  - Input processing               │  │   │
│  │  │  - Collision detection            │  │   │
│  │  │  - Phase/timer management         │  │   │
│  │  │  - Reconnect slot management      │  │   │
│  │  └────────────────────────────────────┘  │   │
│  │  RoomRegistry: Map<roomId, GameRoom>     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Key principle:** Server is fully authoritative. Clients send inputs only; server validates and broadcasts state. Clients render what the server says.

---

## Project Structure

```
/
├── shared/                         # Code both sides import (plain TS, no npm imports)
│   ├── types.ts                    # Messages, events, shop/teams/characters catalogs, name rules
│   ├── hex.ts                      # Hex grid math, structure footprint and hexagon
│   ├── constants.ts                # Sizes both sides must agree on (HEX_SIZE, radii, SCREEN_Y_SCALE, ...)
│   ├── projectiles.ts              # projectileVelocity (server movement + client extrapolation)
│   ├── terrain.ts                  # isShallowWater: the shallow/deep water rule
│   ├── state.ts                    # Synced state interfaces (server schema implements them)
│   ├── eslint.config.mjs           # Re-exports the server's ESLint config (linted by server's npm run lint)
│   └── .prettierrc.json
│
├── server/                         # Node.js + Colyseus server
│   ├── src/
│   │   ├── index.ts                # Entry point — Colyseus Server + Express health route
│   │   ├── constants.ts            # Server tunables (tick rate, speed/accel, health, phases...) + re-exports shared/constants.ts
│   │   ├── hex.ts                  # Re-exports shared/hex.ts + structureContact() (structure collisions)
│   │   ├── teams.ts                # areAllies(): same player or same team
│   │   ├── terrain.ts              # Random terrain per match: mountains, lakes, rivers (generateTerrain, seededRandom)
│   │   ├── pickups.ts              # Pickup placement and rolls per match (generatePickups, rollPickup)
│   │   ├── bots/                   # How bots decide (BotSystem runs them): see Game Mechanics → Bots
│   │   │   ├── brain.ts            # BotBrain: what each bot remembers between ticks (route, goal, targets, timers)
│   │   │   ├── navigation.ts       # Hex BFS: claim routes, routes toward a hex, structure spots (findBuildSite)
│   │   │   ├── aim.ts              # Line of sight, screen distance, leading a moving target, aim wobble
│   │   │   └── shopping.ts         # nextPurchase: the next item on a difficulty's shopping list
│   │   ├── rooms/
│   │   │   └── GameRoom.ts         # Colyseus room — lifecycle, message handlers, tick loop
│   │   ├── state/
│   │   │   └── GameState.ts        # Colyseus schema definitions
│   │   ├── systems/
│   │   │   ├── Broadcast.ts        # Shared callback type systems use to emit discrete events
│   │   │   ├── LobbySystem.ts      # Team/character/ready picks, default team, ready -> countdown -> playing
│   │   │   ├── BotSystem.ts        # Bots: add/change/remove in the lobby; each tick think, steer, shoot, fabricate
│   │   │   ├── CharacterSystem.ts  # Applies a character's starting kit (gun, ammo, materials, structures, upgrade levels)
│   │   │   ├── UpgradeSystem.ts    # Upgrade levels and the one equipped slot: effects, speed, flying, equip/level up
│   │   │   ├── MovementSystem.ts   # Eases velocity toward the input direction (accel-limited), drops stale input, slides around enemy structures and solid terrain, Booster speed
│   │   │   ├── CollisionSystem.ts  # Tile-claiming collision, first-claim materials, batched tilesClaimed broadcast
│   │   │   ├── PickupSystem.ts     # Taking pickups by walking onto their hex; pickupCollected broadcast
│   │   │   ├── CombatSystem.ts     # fire(): a shot from a player; spawnShot(); projectile movement, hit detection, kills
│   │   │   ├── TowerSystem.ts      # Guard Towers: shoot the nearest enemy player in range (2026-10-03)
│   │   │   ├── RespawnSystem.ts    # Defeat (gear into a backpack), the respawn delay, taking a backpack back
│   │   │   ├── StructureSystem.ts  # canPlace/place(): building from the inventory; structure damage/destruction
│   │   │   ├── PhaseSystem.ts      # Phase transitions; times playing -> results
│   │   │   ├── EconomySystem.ts    # Dev-only material grant (claim income is in CollisionSystem)
│   │   │   ├── ScoreSystem.ts      # Recomputes each player's score: tiles + structure points (kills 0)
│   │   │   └── ShopSystem.ts       # Validates purchases; grant() applies an item (also used by pickups)
│   │   ├── test/
│   │   │   └── world.ts            # Spec helpers: world(), addPlayer, addStructure, setTerrain, drive, ...
│   │   └── types/
│   │       └── shared.ts           # Re-exports shared/types.ts
│   │   (every *.ts has a *.spec.ts next to it: Vitest, `npm test`)
│   ├── tsconfig.json               # Type-checks everything, specs included (npm run typecheck)
│   ├── tsconfig.build.json         # What npm run build compiles: tsconfig.json minus specs and src/test/
│   ├── vitest.config.ts            # Server unit tests (npm test); specs sit next to the code
│   ├── eslint.config.mjs           # ESLint 10 flat config (Node globals)
│   ├── .prettierrc.json
│   ├── .prettierignore
│   ├── .gitignore
│   └── package.json
│
├── client/                         # React + Phaser client
│   ├── src/
│   │   ├── main.tsx                # Vite entry point — wraps <App /> in <GameProvider>
│   │   ├── App.tsx                 # Routes on connection status + room phase — see Client — React Shell
│   │   ├── vite-env.d.ts           # Vite client types + VITE_SERVER_URL ImportMetaEnv typing
│   │   ├── context/
│   │   │   └── GameContext.tsx     # GameProvider/useGameConnection: connection lifecycle, reconnection, phase/roster state
│   │   ├── net/
│   │   │   ├── config.ts           # SERVER_URL from VITE_SERVER_URL env var
│   │   │   └── GameConnection.ts   # Client/Room wrapper, typed send helpers, reconnection-token persistence
│   │   ├── types/
│   │   │   ├── shared.ts           # Re-exports shared/types.ts
│   │   │   └── gameState.ts        # Re-exports shared/state.ts (the decoded room.state shape)
│   │   ├── utils/
│   │   │   ├── device.ts           # isTouchDevice() — picks keyboard vs. virtual-joystick input
│   │   │   ├── score.ts            # scoreFor(player) — reads the server-computed Player.score
│   │   │   ├── usePhaseCountdown.ts # Hook: whole seconds left in the current phase
│   │   │   ├── playerName.ts       # The saved player name (localStorage)
│   │   │   └── results.ts          # rankScores() (shared ranks for ties), teamTotals(), scoresFromPlayers() fallback
│   │   ├── components/
│   │   │   ├── HUD.tsx             # Own player's health/gun/ammo/tiles/materials/structures, equipped upgrade, Armor + phase countdown (top left)
│   │   │   ├── NoticeStack.tsx     # Short toasts (disconnect/reconnect), top center
│   │   │   ├── DebugStats.tsx      # FPS / ms-per-frame / renderer readout (` key)
│   │   │   ├── ScoreBadge.tsx      # Always-visible own score (top center)
│   │   │   ├── BuildMenu.tsx       # The Build popup, two tabs: Structures (buy; Place; never locked) and Upgrades (UpgradesPanel); materials and tile limit in the header
│   │   │   ├── UpgradesPanel.tsx   # The Upgrades tab (the Fabricator popup until 2026-10-03): weapons and upgrades from SHOP_ITEMS
│   │   │   ├── menuStyles.ts       # The buttons' CSS shared by the menu
│   │   │   ├── StructureIcon.tsx   # Small SVG pictures of the four structures (Build menu, inventory bar), on a pad of hexes in the player's color
│   │   │   ├── WeaponIcon.tsx      # Small SVG pictures of the Blaster, Ion Cannon and ammo pack (Upgrades tab); weaponIds.ts has WeaponId / isWeaponId
│   │   │   ├── ColorPicker.tsx     # The lobby's color/team swatch and its popup of ten swatches (2 rows of 5)
│   │   │   ├── Leaderboard.tsx     # Popup listing all players by score; toggled from GameScreen
│   │   │   ├── MobileJoystick.tsx  # Drag-based virtual joystick (touch input)
│   │   │   ├── FireButton.tsx      # Hold-to-fire button (touch, during the match only)
│   │   │   └── RespawnOverlay.tsx  # "Defeated — respawning in N…" and where your gear went
│   │   ├── screens/
│   │   │   ├── LobbyScreen.tsx     # Player list with team/character/Ready, countdown, your character's kit
│   │   │   ├── GameScreen.tsx      # Hosts the Phaser canvas + HUD/score/fabricator/inventory/leaderboard/joystick/fire/build overlays
│   │   │   └── ResultsScreen.tsx   # Final standings (+ team totals) + Play again / Main menu (stays up after the room closes)
│   │   ├── test/
│   │   │   ├── setup.ts            # Vitest setup: jest-dom matchers, cleanup after each test
│   │   │   ├── factories.ts        # makePlayer / makeScore test data
│   │   │   └── brush.ts            # A drawing Brush that records its calls (structure art specs)
│   │   └── game/
│   │       ├── PhaserGame.ts       # Phaser.Game config and init; destroyPhaserGame
│   │       ├── backpack.ts         # The backpack drawing and its ground ring (vector graphics)
│   │       ├── constants.ts        # Client render/smoothing/iso constants + re-exports shared/constants.ts
│   │       ├── terrain.ts          # Re-exports shared/terrain.ts
│   │       ├── structures/         # The structures' art, drawn in code: canvas.ts (a tiny 3D drawing kit), common.ts (the pad, flags), farm.ts, fabricator.ts, guardTower.ts, powerPlant.ts, index.ts (draw, bake to a texture, smoke)
│   │       ├── hex.ts              # Re-exports shared/hex.ts + isometric project()/unproject()/hexCorners()/structureCorners()
│   │       └── scenes/
│   │           └── GameScene.ts    # Iso hex terrain, entities, smoothing, mouse-aim/joystick input — see Client — Phaser Game
│   ├── index.html
│   ├── vite.config.ts              # Vite + the Vitest `test` block (jsdom); lets the dev server read ../shared
│   ├── tsconfig.json
│   ├── tsconfig.app.json           # src + ../shared, type-check only
│   ├── tsconfig.node.json          # vite.config.ts, type-check only (noEmit — see Gotchas)
│   ├── eslint.config.js            # ESLint 10 flat config (browser globals + React)
│   ├── .prettierrc.json
│   ├── .prettierignore
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md             # This document
│   ├── GAME_DESIGN.md              # Game rules, numbers, open design questions, design decisions
│   └── HOSTING.md                  # AWS hosting plan (Amplify client, Lightsail server, Caddy)
│
├── tools/                          # End-to-end scripts (plain Node; see tools/README.md)
│   ├── map-preview.js              # Renders generated maps to PNG (whole map, any seed) for tuning terrain
│   ├── e2e.js                      # Real clients vs. its own throwaway server: lifecycle, closing, reconnect, shop, edges
│   ├── bots.js                     # Load bots (wandering WebSocket clients) for profiling a browser client
│   ├── bot-sim.js                  # Headless bot-vs-bot matches on a virtual clock, for tuning BOT_PROFILES
│   └── lib.js                      # Shared helpers
│
├── README.md                       # How to install, run, build, lint; controls; troubleshooting
├── CONTRIBUTION.md                 # How to contribute (issues, style, docs to update)
├── .claude/launch.json             # Private-port dev server configs (2599 / 5199) for Claude Code's preview tools
└── CLAUDE.md                       # Working preferences for Claude Code (git is run by the user; code style; where the docs are)
```

The repo is under git (`main`). Note there are two `package.json`/`node_modules` trees (`server/`, `client/`) and no root workspace — run installs and scripts inside each folder.

---

## Networking Layer

### Transport

WebSocket via Colyseus protocol. Colyseus handles:
- Connection handshake and room routing
- Binary delta-compressed state sync (only changed fields sent each tick)
- Heartbeat / ping-pong (dead connection detection)
- Message framing and routing

### Message Shapes

**Client → Server (inputs only, never state):**
```typescript
// Player movement input. `dir` is a WORLD-space (top-down) vector; its on-screen length —
// hypot(x, y * SCREEN_Y_SCALE) — of 0..1 sets speed (analog joystick), longer vectors are clamped. `angle` (optional) is the facing/aim in radians.
// Send at most every 50ms, and at least every 250ms while active — the server discards input older than 750ms.
{ type: "input", dir: { x: number, y: number }, angle?: number, seq: number }

// Player shoots
{ type: "shoot", angle: number, seq: number }

// Place structure. tileX/tileY are hex column/row (offset coords), not pixels. structureType must
// be in the player's structureInventory; one is used up. Every hex of its footprint (7, or the 3 of a
// Guard Tower) must be yours. `rotation` (0-5, optional) turns a 3-hex structure; the rest ignore it.
{ type: "placeStructure", tileX: number, tileY: number, structureType: StructureType, rotation?: number, seq: number }

// Lobby (the `lobby` and `countdown` phases only). Team and character changes are refused while
// the player is ready. There is no "start game" message: the match starts itself once every
// connected player is ready (see Game Phases).
{ type: "selectTeam", teamId: TeamId }             // "red" | "blue" | ... (TEAMS)
{ type: "selectCharacter", characterId: CharacterId } // "farmer" | "engineer" | ... (CHARACTERS)
{ type: "setReady", ready: boolean }
{ type: "setName", name: string }                   // 2–25 characters; allowed while ready

// Bots (the `lobby` phase only, not the countdown; any player may send them). See Game Mechanics → Bots.
{ type: "addBot", difficulty: BotDifficulty }        // "easy" | "medium" | "hard"; refused when 10 players
{ type: "removeBot", botId: string }
{ type: "updateBot", botId: string, difficulty?: BotDifficulty, teamId?: TeamId, characterId?: CharacterId }

// Join options (client.joinById(code, options) / client.create('GameRoom', options)); not sent on
// a reconnect. `game` only matters when creating: the Create game settings (normalizeGameSettings).
{ name?: string, game?: Partial<GameSettings> }  // name: the saved name; falls back to "Player N"

// HTTP, not the socket: GET /games → GameListing[] (the open games, for the game list).

// Buy an item (allowed during `playing` only). itemId is a ShopItemId: "basicGun", "bigGun", "ammo",
// "booster", "expander", "armor", "wings", "farm", "fabricator", "guardTower" or "power" (see SHOP_ITEMS); an
// upgrade buys its next level. The server checks materials, phase and ownership (ownsShopItem), and
// that everything but a structure comes from a player who owns a Fabricator.
{ type: "purchase", itemId: ShopItemId }

// Equip an owned slot upgrade ("booster" | "expander" | "wings"), or "" to empty the slot. Playing
// phase only; refused for leaving Jetpack over solid terrain. No cooldown (removed 2026-09-27).
{ type: "equipUpgrade", upgradeId: UpgradeId | "" }

// DEV ONLY (temporary): +DEV_MATERIALS (500) during `playing`; the M key in dev builds. Refused by a
// server running with NODE_ENV=production.
{ type: "devMaterials" }

// Reconnect (sent automatically by Colyseus client)
{ type: "reconnect", reconnectionToken: string }
```

**Server → Client (via Colyseus state delta):**
```typescript
// Colyseus broadcasts state diffs automatically.
// Discrete events broadcast to all clients:
{ type: "playerHit",    targetId: string, damage: number, shooterId: string }
{ type: "tilesClaimed", tiles: Array<{ x, y, ownerId }> }
{ type: "structureDestroyed", structureId: string }
{ type: "phaseChanged",  phase: GamePhase, endsAt: number }
// A player took a pickup (it's also removed from state.pickups). The client tells only that player.
{ type: "pickupCollected", playerId: string, kind: "materials" | "ammo" | "item", itemId: ShopItemId | "", amount: number }
// Sent to one client only (client.send): they took back one of their backpacks, and what was in it.
{ type: "backpackCollected", contents: string }   // "Ion Cannon, 12 ammo, Booster 2"
// Sent once when the match ends (phase -> results): final standings, best first.
{ type: "gameOver",      scores: Array<{ playerId, name, color, teamId, score, tilesOwned, kills, structures }> }

// Sent to the originating client only (client.send, not broadcast):
{ type: "inputAck", seq: number }
```

> **Implemented and verified 2026-09-19** via direct system-level tests (no client needed — see Testing Multiplayer Locally): `playerHit`, `tilesClaimed` (batched per tick, not one broadcast per tile), `structureDestroyed`, and `phaseChanged` all fire correctly. `inputAck` is sent per-client via `client.send()` rather than broadcast, since it's only meaningful to the client that sent the input. `playerDisconnected`/`playerReconnected` were **wired on 2026-09-20** (both carry the player's `name`; see Reconnection System) — before that, connection changes were visible only through the `Player.connected` schema field. (`gameOver` *was* wired on 2026-09-20 — see [Results screen](#results-screen).) [Historical, pre-2026-09-20: the `results` phase is entered but nothing happens in it besides the phase timer).

### Sequence Numbers
Client tags each input with an incrementing `seq` number. The server stores each player's latest `{ dir, seq }` (overwriting, not queueing — only the most recent input matters for a continuous-movement game) and echoes `seq` back via `inputAck` once processed. Client uses this to reconcile which predicted moves have been confirmed and discard stale predictions.

---

## Server — Colyseus

> The server runs `colyseus@0.16.5` (not the 0.18 line an earlier draft of this doc targeted — see the compatibility note under [Tech Stack](#tech-stack) for why). Notable API points for this version:
> - `Room` is generic directly over the state class: `Room<GameState>`.
> - Client departure is a single `onLeave(client, consented: boolean)` hook. Call `this.allowReconnection(client, seconds)` inside it (in a `try`) when `!consented`; cleanup (releasing tiles, deleting the player, promoting a new host) happens either immediately (`consented === true`) or in the `catch` once the reconnection window is confirmed to have expired.
> - The HTTP server is constructed explicitly and handed to Colyseus via a transport: `new Server({ transport: new WebSocketTransport({ server: httpServer }) })`, where `httpServer` is a plain `http.createServer(expressApp)`. Colyseus does not own the HTTP server in this version.
> - `@colyseus/schema` v3's `@type()` decorator is a **legacy** (non-standard) decorator at runtime, so it needs `experimentalDecorators: true` and `emitDecoratorMetadata: true` in `tsconfig.json` — without them, TypeScript reports `TS1240: Unable to resolve signature of property decorator`.
> - **`tsconfig.json` also needs `"useDefineForClassFields": false`.** At `target: "ES2022"`, TypeScript defaults this to `true`, which compiles class-field initializers to `Object.defineProperty` calls in the constructor — silently overwriting the accessor `@type()` installs on the prototype, and causing every full-state encode to crash with `Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')`. See the Tech Stack note and [Build Tooling](#build-tooling) for the full story.
> - **`Room` reserves the property name `inputs`** for its own built-in input-buffering/rollback API (`this.defineInput(...)`, `this.inputs.get(sessionId)`). A subclass field named `inputs` collides with it and fails to compile (`TS2416`). This scaffold's per-player input storage is named `playerInputs` instead — pick a different name if you add your own.

### Room Setup (`GameRoom.ts`)

The room is thin: it wires messages and the tick to the systems, which hold the rules. **Read `server/src/rooms/GameRoom.ts` itself** (about 290 lines). An earlier version of this section copied the whole file in, and the copy drifted out of date. Here is a map of it instead (checked against the code 2026-09-26):

- **Private fields** (not synced, since clients don't need them): `playerInputs` (last input per session, and each bot's input, which `BotSystem` writes; not named `inputs`, see above), `matchFinished`, `closing` and `listedPhase`. (`nextProjectileId` became `GameState.shotsFired` on 2026-09-28, when firing moved into `CombatSystem.fire`.)
- **`onCreate(options)`** (async) first sets `this.roomId` to a fresh 4-character code (`uniqueGameCode`, see *Games: codes, settings and the list*), then builds a `GameState` whose `settings` come from `normalizeGameSettings(options.game)` (the Create game screen; a plain `joinOrCreate` gets the defaults, guns off) and whose `mapWidth`/`mapHeight` come from `MAP_SIZES`. It fills `tiles` from `generateTerrain(mapWidth, mapHeight, seededRandom(random seed))`, a fresh map every match (see *Terrain*), then, if the game has pods (`settings.pods`, vetoed by `PICKUPS_ENABLED`), fills `pickups` from `generatePickups` with the same random stream (see *Pickups*). It then calls `setState`, publishes the listing (`updateListing` → `setMetadata`; refreshed from `tick` whenever the phase changes), and starts `setSimulationInterval` at `TICK_RATE` (20 Hz). Message handlers:
  - `input` goes to `handleInput`. It clamps the direction (x to ±1, y to ±1/`SCREEN_Y_SCALE`), stores it with `receivedAt`, sanitizes `angle`, and replies with `inputAck`.
  - `shoot` goes to `CombatSystem.fire` (since 2026-09-28; bots fire through it too). The phase must be `playing`, and the player needs a gun and ammo. It spends 1 ammo and stamps the projectile's `damage` from `GUN_DAMAGE`.
  - `placeStructure` goes to `StructureSystem.place` (since 2026-09-28; bots build through it too). The phase must be `playing`, the type must be in the player's `structureInventory`, and `canPlace` must allow the spot. It removes that inventory entry.
  - `addBot`, `removeBot` and `updateBot` go to `BotSystem.add` / `remove` / `configure` (via `withPlayer`). After an add or remove, `syncBotSeats` sets `maxClients` to `SPAWN_SLOTS` minus the bots and refreshes the listing (see *Bots*).
  - `selectTeam`, `selectCharacter`, `setReady` and `setName` go to `LobbySystem`. `equipUpgrade` goes to `UpgradeSystem.equip`. All of them use `withPlayer`, which ignores unknown or disconnected players.
  - `purchase` goes to `ShopSystem.purchase`, during `playing` only.
  - `devMaterials` (dev only, temporary) goes to `EconomySystem.grantDevMaterials`.
- **`onJoin`**:
  - The client gets its own `StateView` (with the root state in it), so it's sent only its own backpacks (see *Defeat, respawn and backpacks*). Colyseus hands the view to a reconnecting client.
  - The name is `LobbySystem.joiningName(options.name)`: the saved name, or "Player N", made unique.
  - The team is `defaultTeam`.
  - Someone who joins mid-match gets the default character's kit through `CharacterSystem.apply`.
  - The player takes the lowest free spawn slot and is placed on that slot's hex (`assignSpawn`, shared with bots: `freeSpawnSlot`, kept on the non-synced `Player.spawnSlot`, so a reconnect keeps it, then `spawnPoint`). See *Spawn line* under Game Mechanics → Terrain.
- **`onLeave`** sets `connected = false`. If the leave was consented, or the match is in results, it calls `cleanupPlayer` right away. Otherwise it broadcasts `playerDisconnected` and runs `allowReconnection` for `RECONNECT_WINDOW_SECONDS` (180). When the player returns, it broadcasts `playerReconnected` to everyone except them. If the window runs out, it calls `cleanupPlayer`. See [Reconnection System](#reconnection-system).
- **`cleanupPlayer`** releases the player's tiles and deletes the player, their input and their backpacks. Their structures stay.
- **`tick(dt)`** runs, in this order: `LobbySystem`, `BotSystem` (bots' inputs and actions, so they move this same tick), `MovementSystem`, `CollisionSystem`, `PickupSystem`, `RespawnSystem` (respawns that are due, backpacks taken back; private `backpackCollected` through `notifyPlayer`), `CombatSystem`, `PhaseSystem`, `closeFinishedMatch`, `ScoreSystem`, then `showBackpacks` (adds each new backpack to its owner's view). (`EconomySystem` had a timed payout here until 2026-09-26.)
- **`closeFinishedMatch`** runs once the phase is `results`. The first time, it calls `lock()`, refreshes scores and broadcasts the `gameOver` snapshot. When results end, it calls `disconnect()`. See [Room Lifecycle](#room-lifecycle).

Systems are plain modules (not Room subclasses) so they're unit-testable without a live Room — see [Testing Multiplayer Locally](#testing-multiplayer-locally). GameRoom passes a `Broadcast` callback (`(type, payload) => this.broadcast(type, payload)`) into each system's `update()` so they can emit discrete events without needing a reference to the Room itself.

### Server Entry Point (`index.ts`)

```typescript
import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import { Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './rooms/GameRoom';

// Default BUFFER_SIZE (8KB) is too small for a full-state sync of a 64x64
// tile map (4096 Tile schema instances plus players/structures/projectiles) —
// bump it so `getFullState` doesn't overflow when a client joins.
Encoder.BUFFER_SIZE = 128 * 1024;

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

const httpServer = createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('GameRoom', GameRoom);

httpServer.listen(PORT, () => {
    console.log(`Game server listening on :${PORT}`);
});
```

---


---

## Game State Schema

Colyseus schemas automatically produce delta-compressed state diffs. Only changed fields are sent over the wire each tick.

```typescript
import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string')  id: string = '';
  @type('string')  name: string = '';
  @type('number')  x: number = 0;
  @type('number')  y: number = 0;
  @type('number')  vx: number = 0;               // px/sec, synced so clients can extrapolate between ticks
  @type('number')  vy: number = 0;
  @type('number')  angle: number = 0;            // facing/aim, radians, world space
  @type('number')  health: number = 100;
  @type('number')  maxHealth: number = 100;      // 200 with the Armor upgrade
  @type('number')  ammo: number = 0;             // ammo/materials/gun/inventory/upgrades: set from the character at match start
  @type('number')  tilesOwned: number = 0;
  @type('number')  tileCap: number = 500;        // most hexes they may hold: 500 + 500 per farm (StructureSystem.refreshOwner)
  @type('boolean') hasFabricator: boolean = false; // owns a Fabricator: the Fabricator menu is open (refreshOwner)
  @type('number')  kills: number = 0;
  @type('number')  score: number = 0;            // computed by ScoreSystem: tiles + structure points (kills are worth 0; no materials)
  @type('number')  materials: number = 0;          // + MATERIALS_PER_CLAIM per hex claimed (CollisionSystem)
  @type('number')  claimRadius: number = 32;     // world px (BASE_CLAIM_RADIUS); 80 once the Harvester is owned
  @type('boolean') connected: boolean = true;
  @type('string')  color: string = '';           // always the team's color (TEAMS)
  @type('string')  teamId: string = '';          // a TeamId; same team = allies
  @type('string')  character: string = 'farmer'; // a CharacterId (DEFAULT_CHARACTER), picked in the lobby
  @type('boolean') ready: boolean = false;       // lobby only
  @type('string')  gun: string = '';             // a GunId, or '' = unarmed (can't shoot)
  @type(['string']) structureInventory = new ArraySchema<string>(); // StructureTypes left to place
  @type('uint8')   boosterLevel: number = 0;  // upgrade levels, 0 = not owned (UPGRADES in shared/types.ts)
  @type('uint8')   expanderLevel: number = 0;
  @type('uint8')   armorLevel: number = 0;
  @type('uint8')   wingsLevel: number = 0;
  @type('string')  equippedUpgrade: string = '';   // the one slot upgrade in effect, '' = none
  @type('uint8')   spawnTileX: number = 0;          // the spawn hex (col, row), for the spawn platform
  @type('uint8')   spawnTileY: number = 0;
  @type('boolean') bot: boolean = false;            // computer-controlled (2026-09-28): no client, always ready
  @type('string')  botDifficulty: string = '';      // a BotDifficulty for a bot, '' for a person
  @type('number')  respawnAt: number = 0;           // defeated, back at this server time (ms); 0 = in play
  @type('number')  graceUntil: number = 0;          // just respawned: untouchable until this server time (ms); 0 = no grace
  spawnSlot: number = 0;                            // server only
}

export class Tile extends Schema {
  @type('string')  ownerId: string = '';    // empty string = unclaimed
  @type('uint8')   terrain: Terrain = 0;     // TERRAIN.ground (0) / mountain (1) / water (2); set once per room
}

export class Projectile extends Schema {
  @type('string')  id: string = '';
  @type('string')  ownerId: string = '';
  @type('number')  x: number = 0;
  @type('number')  y: number = 0;
  @type('number')  angle: number = 0;
  @type('number')  speed: number = 400;    // on-screen pixels/sec (see SCREEN_Y_SCALE)
  @type('number')  spawnedAt: number = 0;  // server timestamp ms, for lifetime expiry
  @type('number')  damage: number = 50;    // from the shooter's gun (GUN_DAMAGE)
}

export class Structure extends Schema {
  @type('string')  id: string = '';
  @type('string')  ownerId: string = '';
  @type('number')  tileX: number = 0;
  @type('number')  tileY: number = 0;
  @type('string')  type: string = 'farm';   // a StructureType
  @type('uint8')   rotation: number = 0;    // 0-5: how a 3-hex structure (the Guard Tower) is turned
  @type('number')  health: number = 1000;   // set from STRUCTURE_SPECS[type].health when placed
  @type('number')  maxHealth: number = 1000;
  // server only (not synced): nextShotAt, a Guard Tower's next allowed shot
}

export class GamePhaseState extends Schema {
  @type('string')  phase: string = 'lobby';  // lobby | countdown | playing | results
  @type('number')  endsAt: number = 0;       // server timestamp ms
}

export class GameState extends Schema {
  @type({ map: Player })      players     = new MapSchema<Player>();
  @type({ map: Structure })   structures  = new MapSchema<Structure>();
  @type({ map: Projectile })  projectiles = new MapSchema<Projectile>();
  @type({ map: Pickup })      pickups     = new MapSchema<Pickup>(); // id, tileX, tileY: contents are rolled on opening (2026-09-27)
  @type([Tile])               tiles       = new ArraySchema<Tile>(); // flat array, index = y*width+x
  @type([MountainPiece])      mountains   = new ArraySchema<MountainPiece>(); // size (3|7) + hexes (tile indices), set once (2026-09-29)
  @type('string')             theme       = 'slate'; // a TerrainThemeId: the match's color scheme, picked at random (2026-10-02)
  @type(GamePhaseState)       phase       = new GamePhaseState();
  @type(GameSettingsSchema)   settings    = new GameSettingsSchema(); // name, mapSize, teams, pods, matchMinutes (2026-09-27)
  @type('number')             mapWidth: number  = 64;
  @type('number')             mapHeight: number = 64;
  @view() @type({ map: Backpack }) backpacks = new MapSchema<Backpack>(); // id, ownerId, tileX, tileY; each client sees only its own
  // Server only (not synced): nextPodWaveAt, pendingPods, podsMade (Pickups); shotsFired, botsMade
  // and backpacksMade (unique ids); botBrains: Map<playerId, BotBrain> (Bots). A Backpack's contents
  // (gun, ammo, upgrade levels, equippedUpgrade) are plain fields, never synced.
}
```

> Every field needs a default value (`= ''`, `= 0`, etc.) — `@colyseus/schema` requires initialized properties. `Projectile.spawnedAt` was added during implementation (not in the original draft) so `CombatSystem` can expire projectiles by age without keeping any spawn-time bookkeeping in module-level state, which would leak across concurrent rooms since systems are shared singletons.
>
> **These field initializers are also the reason the server's `tsconfig.json` needs `"useDefineForClassFields": false`** — see the note under [Server — Colyseus](#server--colyseus). Without it, TypeScript compiles `id: string = '';` to an `Object.defineProperty` call in the constructor, which overwrites the getter/setter `@type()` installs on the prototype and breaks change tracking silently (no compile error — it fails at encode time, on the first client join).

---

## Game Mechanics

This section is about **how** each rule is implemented: which system owns it, the constants, edge cases and what was verified. The rules themselves, with their current numbers and the reasoning behind them, are in [`GAME_DESIGN.md`](GAME_DESIGN.md). Each subsection links to its rules.

### Map — hex grid and coordinate spaces

> Rules: [The map](GAME_DESIGN.md#the-map).

The map is **64 × 64 flat-top hexes** in an **odd-q offset** layout (odd columns sit half a hex lower), stored in the flat `tiles` array at index `row * mapWidth + col`. `tileX`/`tileY` in messages and events are hex **column/row**, not pixels. (`mapWidth`/`mapHeight` are column/row counts.)

There are two coordinate spaces, and mixing them up is the main way to introduce bugs here:

| Space | Used by | Definition |
|---|---|---|
| **World** | The server, all state (`x`, `y`, `vx`, `vy`, projectile positions), message payloads | Top-down, pixels, y down. Hex size `HEX_SIZE = 32` (circumradius); flat-to-flat height is `√3 × HEX_SIZE`. |
| **Scene** (screen) | Only the client's Phaser objects | World with `y` multiplied by `ISO_SQUASH` (0.6). This *is* the isometric look. |

The isometric view is **purely a render-time transform**. The server never sees it, so hex math, collision, and movement stay simple top-down. The client `project()`s everything it reads from the server before it touches a Phaser object, and `unproject()`s everything it reads from the pointer or joystick before sending it back (otherwise "aim at the cursor" and "walk where the stick points" come out wrong vertically).

`shared/hex.ts` provides `hexCenter(col,row)`, `pixelToHex(x,y)` (axial cube-rounding, returns coords that may be off-map), `mapPixelSize(cols,rows)`, `isValidHex`, and `hexIndex`. Both sides import it (the server through `server/src/hex.ts`, which adds structure collisions; the client through `client/src/game/hex.ts`, which adds the projection helpers). Verified 2026-09-20: `hexCenter`→`pixelToHex` round-trips exactly for all 4,096 tiles, including points offset toward each hex's edge.

Known limitation: the map's pixel bounds are a rectangle, but the hex edge is jagged, so a player can stand at a corner over *no* hex. Claiming simply ignores those spots.

**Map edge and camera (2026-09-20):** players are clamped `MAP_EDGE_MARGIN` (20 world px = one player radius) *inside* the map rectangle, so their whole body stays on the terrain instead of half hanging over the edge (verified by pushing a player hard into the left and top edges: closest position exactly 20). The client camera has **no bounds** — it always centers on the local player, even at the map's edge (empty space shows beyond the map), so you can never walk off the screen. (It used to be bounded to the map, which clipped the player against the screen edge there.) The camera also starts already centered on the player instead of panning in from the corner.

### Terrain

All three steps built 2026-09-26: **generation and drawing**, **the rules** (solid mountains and deep water, unclaimable terrain, mountains blocking shots), and **the Jetpack upgrade** (a shop upgrade that makes `MovementSystem` skip `pushOutOfTerrain`; claiming and shots are unchanged for winged players). See [GAME_DESIGN.md → Terrain](GAME_DESIGN.md#terrain) for the rules.
- **Data:** `Tile.terrain` is a `uint8` (`TERRAIN` in `shared/types.ts`: ground 0, mountain 1, water 2), set in `GameRoom.onCreate` and sent once with the initial full state (~4 KB). Every client reads it from state, so there's no generator on the client and no risk of two sides generating different maps.
- **Generation** (`server/src/terrain.ts`, `generateTerrain(cols, rows, random)`): features are added one at a time — kind picked by `TERRAIN_FEATURE_WEIGHTS` — until `TERRAIN_COVERAGE` (10%) of the map is covered; a feature that would overshoot by more than 1% of the map is skipped (a smaller one follows). **Mountain ranges** (`growRange`, 3–35 hexes) are built from pieces — small (3 mutually adjacent hexes) and large (a hex and its 6 neighbors), large with `MOUNTAIN_LARGE_CHANCE` when it fits — each placed, over every candidate beside the range in every orientation, where it shares the most sides with the range (ties at random); the result records `pieces` for future sprites. **Lakes** (`growLake`, 3–32) grow one hex at a time onto the open hex touching the lake most. A range or lake boxed in below its minimum is dropped. **Rivers** walk a course of 2–20 hexes that bends 60° now and then (`RIVER_TURN_CHANCE`); each course hex is widened by a short row of hexes to one side, 1–4 across (`RIVER_WIDTH`), drifting by one as it goes (`RIVER_WIDTH_CHANGE_CHANCE`); afterwards any free hex with `RIVER_POCKET_FILL` (4) or more neighbors in the river is filled, repeatedly. A feature only grows onto a hex that's free, outside `SPAWN_CLEAR_RADIUS` (3) of every spawn hex, and **with no other feature within `FEATURE_GAP` (3) hexes**. After each feature a flood fill from the first spawn hex checks that every ground hex is still reachable on foot (shallow water counts as walkable); if not, that feature is **undone** and generation carries on, so it never has to restart.
- **Spawn line** (`spawnHex(cols, rows, slot)` in `server/src/terrain.ts`, 2026-09-26): `SPAWN_SLOTS` (10, matching `maxClients`) hexes in one column `SPAWN_EDGE_INSET` (3) in from the east edge; slot 0 is the middle row, then −1, +1, −2, +2… × `SPAWN_ROW_SPACING` (6) rows, clamped to the map. `spawnHexes` lists them all for the generator (the result's `spawns`); `freeSpawnSlot(state)` gives a joiner the lowest slot no current player holds; `spawnPoint(state, slot)` is the hex center, used by `onJoin` and `CombatSystem.respawnPlayer`. The slot is server-only state (`Player.spawnSlot` has no `@type`), since clients just see positions.
- **Randomness:** `seededRandom(seed)` (mulberry32) makes maps reproducible for tests; `GameRoom` passes a random seed.
- **Speed:** ~10 ms per map, run once per room. The lookup tables the checks use millions of times (each hex's neighbor indices, spawn-area membership, and every hex within `FEATURE_GAP`) depend only on the map size, so they're built once per size and cached; shallow-water flags are computed once per feature, since a feature never changes after it's placed. (The first version recomputed neighbors in its inner loops and took ~155 ms, long enough to stall every other room's tick loop — Node runs rooms on one thread.)
- **Shallow water** (`isShallowWater` in `shared/terrain.ts`): a water hex with at most two water neighbors that don't touch each other — water you could step straight across (1-wide river stretches). It's **derived from shape, not stored**: the generator's reachability check, the client's drawing, and step 2's movement all call the same function. Small/large mountain pieces, by contrast, can't be derived from `Tile.terrain`, so they'll need syncing when sprites arrive; for now they exist only in the generator's result.
- **Drawing** (since 2026-09-29; before that, flat colored hexes with gray and dotted borders). The look and its geometry are in `client/src/game/terrainArt.ts`: plain functions, unit-tested in `terrainArt.spec.ts`.
  - **Color schemes** (2026-10-02): every color comes from a `TerrainPalette` (`client/src/game/terrainPalettes.ts`: `SLATE` and `TITAN`), passed into `groundColor`, `groundDetails`, `groundDust`, `mountainModel` and `drawMountain`, and read by `GameScene` as `this.palette` (`paletteFor(room.state.theme)`, Slate for an unknown id). That covers the background, cliffs, outlines, ground and its patch layers (`ground.patches`), rock, snow, scree and liquid. The server picks `GameState.theme` from `TERRAIN_THEME_IDS` (`shared/types.ts`) with the map's random stream in `onCreate`. Adding a scheme takes a palette and an id. `terrainArt.spec.ts` checks every palette: subtle ground patches, and shallow liquid at least 30 brighter than deep liquid at its brightest gleam (`deepGleam`) and at least 30 off every ground color. `tools/e2e.js` checks that games come up in every scheme.
  - **Water** is baked into the base layer by `GameScene.drawBase`, so it costs nothing per frame.
    - Water hex tops: deep water is `DEEP_WATER_COLOR` (inky black since 2026-10-01), mixed toward `DEEP_WATER_DARK` by how many water neighbors it has, with a little per-hex variation. Shallow water is `SHALLOW_WATER_COLOR`.
    - `drawBanks`, right after each water hex's top in the back-to-front pass: along each upper (back) edge whose neighbor isn't water, a `HEX_SIDE_COLOR` band `DEEP_BANK_HEIGHT` / `SHALLOW_BANK_HEIGHT` px deep, with a foam line at its foot. Whatever pokes past the hex's side corners is covered by the hexes in front, drawn next.
    - `drawWaterDetails`, in the second pass: pebbles on shallow beds, wave polylines (`rippleMarks`), and foam just inside each front shore. Edges between water hexes get no lines.
    - Randomness comes from `hexSeed(index, salt)`, so the same map always looks the same.
    - `addWaterSparkles`: up to 160 small ellipses at depth −2.5, each fading in and out on its own tween.
  - **Ground hex tops** (2026-09-30; Titan palette 2026-10-01): `groundColor` mixes `GROUND_BASE` (coffee brown) toward `GROUND_DUNE` (tan) and `GROUND_ROCK` (charcoal) by two layers of smooth value noise (`valueNoise`, 300 and 150 px patches), plus a hint of per-hex light and dark. `GameScene.drawGroundDetails` then adds `groundDetails` (grains, the odd crack and frost patch, all faint) and a bevel (a white line at 0.07 alpha inside the upper edges, a black one at 0.12 inside the lower edges). Claim tints (`rebakeChunk`) are the owner's color at `CLAIM_BLEND` alpha rather than an opaque blend, which looks the same on plain ground but lets the texture show.
  - **Sky reflections on liquid** (2026-10-01): `skyReflection(center)` is smooth noise over 180 px patches. `drawBase` mixes a deep hex's top up to 45% (shallow up to 30%) toward `REFLECTION_COLOR`, a saturated metallic gold, so neighboring hexes gleam together. `drawWaterDetails` adds thin horizontal `REFLECTION_GLINT` streaks where it's strongest.
  - **Mountain texture** (2026-10-01): `mountainModel` mixes rock facets toward `SLOPE_DUST_COLOR` the lower they sit, and marks each facet `snow` or rock. `drawMountain` adds `drawFacetTexture` to each facet: soot and grit specks (by area, up to 7) and, on larger rock facets, a faint stratum line, all from the model's `seed`.
  - **Baking per tile** (2026-09-30): `drawBase` builds one Graphics per base tile, holding only the hexes whose drawing reaches into it (top, cliff and bank). It used to replay one drawing of the whole map into every tile, which would have multiplied the cost of the extra texture by the number of tiles (up to 6 on a Large map).
  - **Mountain hex tops** are `SCREE_COLOR` with darker stones.
  - **Mountains** are drawn by `GameScene.buildMountains`, one per entry in the synced `GameState.mountains`.
    - The server copies each generator `MountainPiece` into a `MountainPiece` schema with its size (3 or 7) and its tile indices, in `onCreate`.
    - `mountainModel(corners, centers, large, seed, ISO_SQUASH)` builds the peak from the footprint's convex hull (pulled in 10%, long edges broken up). It adds one ridge ring (small) or two (large, plus a second summit) at jittered heights, and triangulates up to an off-center peak.
    - Each triangle is lit as 3D (ground y un-squashed back to world y, height up) from the upper left, with a little per-facet noise. The part above a jittered snow line (`SNOW_LINE`) is split off and shaded as snow. Facets are sorted back to front, which is correct for a heightfield seen from the front.
    - `drawMountain` draws its ground shadow and facets into a Graphics object, which is baked with `generateTexture` into `mountain-<i>`. It's shown as an image at depth = the footprint's middle ground y, the same scale players sort on, so a player behind a mountain is hidden by it.
    - About 26 mountains on a Small map, each a texture of up to ~200 × 190 px.
- **Verified 2026-09-26:** `server/src/terrain.spec.ts` checks 40 seeded maps for coverage, feature sizes (both ends of each range) and contiguity, river widths, no holes in rivers or lakes, the 3-hex gap, no lone water, where shallow water occurs, the clear spawn areas, reachability under the shallow-water rule, mountain pieces (shapes, no overlap, exact partition), compactness of ranges and lakes, repeatability and speed, plus `isShallowWater` itself; `GameState.spec.ts` checks terrain survives the Colyseus round trip; `tools/e2e.js` checks a real room's map is ~10% terrain and identical for every client. The generator's look was tuned with `tools/map-preview.js` renders and in-game passes on private ports.
- **Movement** (`MovementSystem.pushOutOfTerrain`, after the structure check): a hex blocks a player on foot if `blocksWalking` (`shared/terrain.ts`) says so — a mountain, or water that isn't shallow. Terrain walls are many hexes, often zigzagging, so rather than refusing moves (the structure approach, fine for one convex shape but it would catch on every zigzag corner), any overlap between the player's circle and a solid hex is **pushed back out** along that hex's edge normal (`hexContact` in `server/src/hex.ts`, the single-hex version of `structureContact`) and the velocity into it is dropped; three passes settle spots where two hexes touch the circle at once. Only the hex under the player and its 6 neighbors can touch a 20 px circle, so that's all it checks. Solidity is looked up live from `Tile.terrain` (a few dozen checks per player per tick), not cached.
- **Claiming:** `CollisionSystem.claimTiles` skips any hex whose terrain isn't ground, so mountains and water (shallow included) are never claimed; and since a structure needs 7 owned hexes, structures never cover terrain, with no change to placement.
- **Shots:** `CombatSystem` removes a projectile whose position at the end — or the middle — of a tick's travel is over a mountain. The midpoint matters: shots fired straight down the screen move ~33 world px a tick, and near a hex's left and right points it's much thinner than that, so an end-point check let some shots skip a corner (the spec fails without it). Water doesn't stop shots.
- **Testing without terrain:** the `TERRAIN_COVERAGE` environment variable (dev/testing only) overrides the coverage, e.g. `TERRAIN_COVERAGE=0` for a map of plain ground; `tools/e2e.js` uses that for its map-edge walk, which random terrain could otherwise block.
- **Verified (step 2):** `server/src/systems/terrainRules.spec.ts` — stopping at a mountain and at deep water, wading shallow water, being pushed out when inside terrain, sliding along a zigzag wall, never overlapping a 19-hex mountain or lake from 90 approaches, no claiming terrain (Harvester included), shots stopped by mountains (shielding a target) but not water, and no shot skipping a mountain corner; `terrain.spec.ts` covers `blocksWalking`. Browser: a player walking into a lake stopped at the shore and claimed none of it.

### Tile Claiming

> Rules: [Territory](GAME_DESIGN.md#territory).

- `CollisionSystem.claimTiles` runs each tick during `playing`. A player claims the hex they're standing on plus every hex whose center is within `Player.claimRadius`, found with a small search window around the player rather than a scan of the whole map. The radius is `BASE_CLAIM_RADIUS = HEX_SIZE` (32 world px; neighbor centers are ~55 px away, so in the open that's just the hex underfoot) or, with the Harvester equipped, `EXPANDER_CLAIM_RADII[level - 1]` = 80 / 125 / 180 px (7 / 19 / 37 hexes from mid-hex; level 1 is 4 × `PLAYER_RADIUS`). `UpgradeSystem.applyUpgradeEffects` sets `claimRadius` from the player's upgrades.
- **Tile limit** (2026-10-03): `claimTiles` first collects every hex it could claim (the ground checks below), sorted nearest first (the hex under the player always first), then claims them one by one while `tilesOwned < tileCap`. At the limit it stops, claims nothing from the unclaimed or from enemies, pays no materials, and returns `true` so `update` can send the player a `tileLimitReached { limit }` message, at most every `TILE_LIMIT_NOTICE_INTERVAL_MS` (8 s; the server-only `Player.tileLimitNoticeAt`). `Player.tileCap` is `tileCapFor(farms)` (`BASE_TILE_CAP` 500 + `TILES_PER_FARM` 500 each), kept up to date by `StructureSystem.refreshOwner` whenever a structure is placed or destroyed; losing a farm never releases hexes. The client shows it as "Tiles: x / y" in the HUD and the Build menu, and turns the message into a warning notice.
- **Skipped hexes:** a teammate's hex (`areAllies`, 2026-09-26), and any hex in an enemy structure's footprint (`isProtectedFrom`; a teammate's structure doesn't block you, but its tiles are a teammate's anyway). The protection keeps the invariant "you own the tiles your structure is on", which a large claim radius would otherwise break constantly.
- Verified 2026-09-20: the search window matches a brute-force scan of every hex exactly (1,200 random positions incl. map edges, 0 mismatches; at 80 px the Harvester claims 2–9 hexes per tick depending on position — 1–7 at the earlier 64 px); a base-radius player at a hex center claims 1, a Harvester owner claims 7 when centered on a hex; stolen tiles keep both players' `tilesOwned` consistent with the tile array.
- Tile ownership stored as `ownerId` string in the flat `tiles` array
- On claim: update tile, increment player's `tilesOwned`, decrement the previous owner's if any
- `CollisionSystem` batches every tile claimed in a tick into a single `tilesClaimed` broadcast rather than one broadcast per tile
- Contested tiles (two players attempt same tile in same tick): resolved by iteration order over `state.players`, which is insertion order (join order) — **not** yet resolved by input `seq` as originally planned; revisit if this matters for fairness at 8-10 concurrent players

### Game Phases

> Rules: [Match flow](GAME_DESIGN.md#match-flow).

| `phase` value | Length constant | Owned by |
|---|---|---|
| `lobby` | — (until everyone connected is ready) | `LobbySystem` |
| `countdown` | `COUNTDOWN_DURATION_MS` (3 s) | `LobbySystem` |
| `playing` | `MATCH_DURATION_MS` (5 min) | `LobbySystem` starts it; `PhaseSystem` ends it |
| `results` | `RESULTS_DURATION_MS` (60 s) | `PhaseSystem` starts it; `GameRoom.closeFinishedMatch` locks and closes the room (see [Room Lifecycle](#room-lifecycle)) |

History: `claiming` (90s) and `combat` (120s) were merged into `playing` on 2026-09-20; a 30s `buying` phase was then added between the lobby and play, and **removed on 2026-09-26** along with the host's `startGame` (and the temporary `endBuying`) when the ready-up lobby replaced them — shopping now happens during play only.

**Dev/testing time scale:** set the environment variable `PHASE_TIME_SCALE` (e.g. `0.02`) on the server to shrink every phase duration (the countdown included), so a whole match runs in seconds. It's only read in `server/src/constants.ts` and is unset normally.

- Server owns all timers. `endsAt` is a server epoch timestamp (ms); client uses this for display countdown and corrects any local drift.
- `LobbySystem.update` (first in the tick) owns `lobby` ⇄ `countdown` → `playing`: lobby → countdown once `everyoneReady` (every *connected* player is ready, and at least one of them is a person: bots are always ready and never start a match alone), countdown → lobby as soon as that stops being true, countdown → playing when its timer runs out — at which point every player gets their character's starting kit (`CharacterSystem.apply`). `PhaseSystem.update` only times `playing` → `results`.
- There is **no host** any more: nobody has to press Start, so nobody needs the role. (The old `hostId`/`reassignHostIfNeeded` handover logic was removed with it.)
- Phase transitions broadcast a `phaseChanged` message with the new phase and `endsAt` (including a cancelled countdown going back to `lobby`, with `endsAt: 0`).

### Lobby, characters and teams

> Rules: [Match flow](GAME_DESIGN.md#match-flow), [Teams](GAME_DESIGN.md#teams), [Characters](GAME_DESIGN.md#characters), and names under [Players](GAME_DESIGN.md#players).

Implemented 2026-09-26. Everything below is validated server-side in `LobbySystem`; the client's locked controls are a convenience.

- **Messages** (lobby and countdown phases only): `selectTeam { teamId }`, `selectCharacter { characterId }`, `setReady { ready }`. Unknown ids and non-boolean `ready` are ignored. Team and character changes are refused while the player is ready.
- **Names** (added 2026-09-26): `normalizePlayerName` (shared) collapses whitespace runs to one space, strips control characters and trims, then requires **2–25 characters** counted as people count them (`nameLength` uses code points, so an emoji is one). The client sends its saved name as a join option, and `setName` renames in the lobby (not locked by being ready). Uniqueness is `LobbySystem.uniqueName`: a name another player already has (ignoring case) becomes the first free `name (1)`, `name (2)`, …, shortened if needed to stay within 25. This also fixed the old duplicate `Player N` names after someone left. Invalid names are ignored; renaming is refused once the match starts.
- **Disconnected players don't hold the lobby up**: `everyoneReady` leaves them out. If they reconnect during the match they play whatever they'd picked.
- **Joining mid-match** (the room is only locked in `results`): `GameRoom.onJoin` applies the default character's kit (`CharacterSystem.apply`) immediately.

**Teams.** `TEAMS` (in `shared/types.ts`) holds the 10 colors (one per seat; pink and brown were added 2026-10-03 for the picker's two rows of five). `Player.teamId` holds one and `Player.color` is always that team's color, so everything that already drew in the player's color (tiles, body, structures, claim ring) shows the team with no rendering changes. There's no `GameState.teams` map: a team has no state of its own yet. `LobbySystem.defaultTeam` gives a newcomer the first team nobody is on yet, else the smallest.

**What being teammates means in code** (`areAllies` in `server/src/teams.ts`: same player, or the same non-empty `teamId`; a player who left the room is nobody's ally):
- No friendly fire: `CombatSystem` lets shots pass through allies and allies' structures.
- `MovementSystem` treats allies' structures as walkable, like your own.
- `CollisionSystem.claimTiles` skips allies' tiles.
- Tiles, materials and score stay per player. The results screen's team table is computed on the client (`teamTotals` in `utils/results.ts`) from the `teamId` in the `gameOver` standings.

**Characters.** `CHARACTERS` in `shared/types.ts` is the catalog (the kits are listed in [GAME_DESIGN → Characters](GAME_DESIGN.md#characters)). `CharacterSystem.apply` replaces the player's gun, ammo, materials, structure inventory and upgrades with the kit when the countdown finishes.

- **Structure inventory:** `Player.structureInventory` lists the structures you can still place, one entry each. `placeStructure` names a `structureType` from it and uses one up. `Structure.type` records which one was placed. Since 2026-10-03 each type has its own numbers in `STRUCTURE_SPECS` (`shared/types.ts`: name, description, cost, health, points, footprint size) and its own effect: farms raise `tileCap`, fabricators set `hasFabricator`, Guard Towers are driven by `TowerSystem`, and `StructureSystem.place` sets health from the spec (see [Structures: footprint and shape](#structures-footprint-and-shape) and [Guard Towers](#guard-towers)). The per-type colors in `STRUCTURE_COLORS` are now only for the menu icons (the structures themselves are drawn by `game/structures`).
- **Guns:** `Player.gun` is `''` (unarmed) or a `GunId`: `'basic'` or `'big'` (damage in `GUN_DAMAGE`). For unarmed players the server ignores `shoot`, and the client doesn't send it and hides the mobile fire button.
- **Upgrades:** upgrade levels live in `Player.boosterLevel` / `expanderLevel` / `armorLevel` / `wingsLevel`, with one equipped slot upgrade (`equippedUpgrade`) — see *Shop → Upgrades* below; the older `Player.upgrades` list (and before it, inferring the Harvester from `claimRadius`). `UpgradeSystem.applyUpgradeEffects` derives `maxHealth` and `claimRadius` whenever levels or the equipped upgrade change; `MovementSystem` asks `UpgradeSystem.speedMultiplier` and `canFly`.

### Structures: footprint and shape

> Rules: [Structures](GAME_DESIGN.md#structures).

Changed 2026-09-26 from one hex to seven; the Guard Tower has a 3-hex footprint since 2026-10-03.
- **Footprint:** a 7-hex structure is placed on a center hex and occupies it plus its 6 neighbors (`structureFootprint` / `hexNeighbors` in the shared part of `hex.ts`). A **compact** structure (the Guard Tower, `STRUCTURE_SPECS[type].hexes === 3`) occupies an anchor hex plus two neighbors that touch each other: `compactFootprint(col, row, rotation)` takes the anchor's neighbors `rotation` and `rotation + 1` in `hexNeighbors` order (`COMPACT_ROTATIONS` = 6 ways). `Structure.rotation` records it (0 for the 7-hex types). Everything that needs a placed structure's hexes goes through `structureHexes(structure)` / `inStructure(col, row, structure)` / `footprintFor(type, col, row, rotation)` in `shared/types.ts` (built on `footprintHexes` / `inFootprint` in `hex.ts`), so claims, protection, pods, respawn, bots and the client all agree. `nearestCompactRotation` picks the turn whose three hexes are centered nearest a world point, which is how the client turns a tower by aiming. **Placement rule** (`StructureSystem.canPlace(state, playerId, type, col, row, rotation)`, mirrored by the client's build preview): every footprint hex must be on the map (so nothing at the edge), owned by the builder (a teammate's hexes don't count), and not part of another structure's footprint. Footprints may touch.
- **Shape** (revised 2026-09-26, same day): the solid, drawn shape is a **flat-top hexagon (like the tiles) with twice a tile's radius** (`STRUCTURE_RADIUS` = 2 × `HEX_SIZE` = 64 px; `STRUCTURE_CORNER_OFFSETS`). It's the largest flat-top hexagon that fits inside the footprint: each corner lands exactly on a notch where two outer hexes meet, and its edges cut straight across the outer hexes (area = 4 hexes). So it **never reaches outside its footprint, and structures never overlap** (`tools/check-rules.js` samples the hexagon against the footprint and tests every nearby pair). The first version was the ≈19.1°-turned hexagon with exactly the 7 hexes' area (√7 × `HEX_SIZE` ≈ 85 px); this one is 2/√7 ≈ 76% of its size, as requested ("~75%, flat top").
- **What the shape is used for:** movement collision (`structureContact(x, y, structure)`, the old single-hex `hexEdgeContact` generalized to any convex shape — same sliding and walk-out behavior, re-verified with 792 approaches), projectile hits (inside the hexagon), and drawing. A Guard Tower's solid shape is its three hexes: `structureContact` returns the contact with the nearest of them (`hexContact`). The footprint (hexes) is used for placement and claim protection.
- **Drawing** (art since 2026-10-03; before that a raised slab per structure, colored by type with team-colored sides): see *Structure art* below. The drawing is cosmetic: collision, hits and placement use the shapes above. A structure is one `Image` sorted by its northmost footprint corner, so its owner (or a teammate) standing on it draws on top instead of being hidden (they were, when it sorted by its center).
- **Build preview:** in build mode the hover outline becomes the structure's footprint (the hexagon, or three hex outlines for a Guard Tower, turned by `GameScene.buildRotation` toward the pointer), yellow if `canPlace` would accept it, red if not. `GameScene.setBuildMode(active, type)` tells the scene which type is armed. A click on a red spot does nothing and stays in build mode; on touch (no hover) a refused tap shows the red outline for 1.2 s. The hint says "all 7 hexes must be yours" or, for a tower, "all 3 touching hexes must be yours (aim at a corner to turn it)". Build mode has no timeout (the old 5 s auto-disarm was removed 2026-09-26); since 2026-10-03 **`P`** toggles it (it was `B`; `B` now opens the Build menu) and `Esc` leaves it, both handled in `GameScreen`. The `onPlaceStructure(tileX, tileY, rotation)` callback sends the turn along.
- **Structure art** (`client/src/game/structures/`, 2026-10-03). Drawn with vector graphics, no image files, and plain math over a small `Brush` interface (`canvas.ts`), so the specs run it with a recording brush instead of Phaser. `Canvas3D` takes shapes on the ground (world px, x right, y toward the viewer) with a height `z` and draws them as the game's isometric view shows them: screen x = x, screen y = y × `ISO_SQUASH` − z. A face is drawn only if its outward normal points along (0, 1, `ISO_SQUASH`) (toward the camera), and lit from the upper left (`lightFactor`, `shadeColor`), so `box`, `cylinder` (any `loft`, a frustum too), `prism`, `frontWall`, `poly` and `line` build solid-looking buildings. Each type is a module: `drawFarm`, `drawFabricator`, `drawGuardTower`, `drawPowerPlant`, all on a `drawHexPad` (below) and most with a `drawFlag`. **The pad** (`common.ts`): the hexes the structure covers (`SEVEN_HEX_CENTERS`: the middle hex and six neighbors a hex apart, or the tower's three hexes relative to the point where they meet) raised 3 px together: sides in a dark shade of the team color, a top in `mixColor(teamColor, 0x14171b, 0.5)` with grit and a lighter inset line on each hex, and a 3 px bright team-color edge along the outer edges only (an edge shared with another hex lies halfway between their centers, which is how it is skipped). It fills the whole footprint, 80 px out for 7 hexes. `common.ts` also holds the 2078 look's shared parts: `glowLine` and `glowDot` (a wide faint halo under a bright thin core, in `CYAN`, `AMBER` or `HOT_RED`) and `pipe` (a dark outline, a bright core, a highlight and clamp rings). The art stays inside the footprint's hexagon (`STRUCTURE_RADIUS` 64 px) apart from height.
  - **Baking:** `bakeStructure(scene, type, teamColor, hexCenters?)` draws a type once per owner color into an `ART_CANVAS` texture (180 × 182 px, the structure's ground middle at (90, 125); the seven-hex pad reaches 50 px below it) and returns its key (`structureTextureKey`); `GameScene.addStructureSprite` shows it as one `Image` at the middle of the footprint (the center hex, or the point where a tower's three hexes meet, which is also where the tower's own pad is drawn from: it takes the three hexes' centers relative to that point). `structureViews` holds the image and, if any, its `SmokeEmitter`; `removeStructureSprite` destroys both.
  - **Farm:** `domePanels(radius, height)` tiles the plane with a honeycomb of flat-top hexagons (side `PANEL_SIZE` 10.5; one hexagon is centered on the top) and maps it onto the dome with an equidistant map (distance from the top becomes angle from the zenith), cutting each panel's edges in two so it bends (12 points a panel) and pulling corners past the rim back onto it. About one panel in nine is `solar` (a fixed pattern of the lattice indices, never the top one), the rest `glass`. Panels facing away are skipped (`n · (0, 1, 0.6) < −0.12`); glass is translucent with white frames, solar a dark blue. The crops, barn and silo are drawn first, so they show through. The dome is a unit-tested pure function (including that every interior corner is shared by exactly three panels, i.e. no gaps). The first version used the 4.8.8 octagon-and-square tiling.
  - **Fabricator:** a hub of gunmetal panels (seams with a lit edge, grime climbing from the ground, streaks, scuffs, a rusty patch, a few dead or red lamps), a bay framed in cyan with amber scan lines, a slanted solar roof (`roofAt(y)` gives its height at a depth) carrying radiator fins, a dish and a mast, two banks of capacitors with glowing rings, a transformer with hazard stripes, an orange robot arm and cargo pods. No chimney.
  - **Guard Tower:** the old plan in new materials: four tapering composite legs on hexagonal footings (`halfAt`), a zigzag truss per face with a glowing joint at each node, a glass-floored landing, a lift (two rails and a capsule) where the ladder was, a deck lit in the team color, an eight-sided cabin (`loft` of an 8-gon) with a smoked-glass band whose faces each get a cyan HUD line (the `face` callback of `loft`), a flared solar canopy with panel lines over a sensor dome and mast, a glass rail, and a twin-barrel rail gun on a faceted gimbal; drawn back to front. The gun does not turn toward its target yet.
  - **Power plant smoke:** `SmokeEmitter(scene, sources, x, y, depth, seed)` (`smokeSources('power')` gives the two thin stack tops, from `powerSmokeSources`) lets go of a puff from alternating stacks every `SMOKE_EVERY_MS` (420 ms); each is a lumpy soft `structure-smoke` texture tinted black to dark brown, tweened up `SMOKE_RISE` (100 px) over `SMOKE_MS` (4.6 s) while it grows and fades (alpha eased in), then destroys itself. It uses a timer and one tween per puff, not delayed infinite tweens (Phaser re-applies a tween's `delay` on every repeat and the puffs went idle), and `destroy()` stops the timer and removes the puffs left. About 18 small images per plant. The plant itself (`powerPlant.ts`) is three stainless vessels (`vessel`, with catwalk rings drawn in two halves, the far half before the vessel and the near half after, so the vessel passes through), a tank, a condenser bank, wellheads, `pipe` runs and a control module; the first version was a gabled hall with a tank.
  - **Sizes and caveats:** the tallest art (the tower, the stacks) rises about 100 px; a 7-hex structure is about 120 px wide. The art is regenerated, never loaded, so a changed drawing shows on the next page load. The Build menu and inventory icons are separate hand-built SVG (`components/StructureIcon.tsx`, below).

### Guard Towers

> Rules: [Structures](GAME_DESIGN.md#structures).

**Limit** (2026-10-03): `MAP_SIZES[mapSize].maxGuardTowers` (10 / 16 / 23; `maxGuardTowers(mapSize)` in `shared/types.ts`) caps the towers one player has, standing plus held. `StructureSystem.towerCount` counts them and `StructureSystem.canHold(state, player, type)` is the check (true for every other type). It is applied in `ShopSystem.purchase` (a 4th argument, `canHold`, which `GameRoom.handlePurchase` and `BotSystem.fabricate` pass), in `PickupSystem` (the structure types handed to `rollPickup` leave out a tower the player can't hold), and in the bots' `nextPurchase` (`needs.towersFull` skips towers on the shopping list and stops `keepBuilding`). `Player.towersBuilt` (synced, set by `refreshOwner`) lets the client's Build menu show "n / limit allowed" (it adds the held ones from `structureInventory`) and disable the buy button; the limit comes from the game's synced `settings.mapSize`.

`TowerSystem.update(state, now)` runs every tick during `playing`, before `CombatSystem.update` (so a shot it starts moves this tick). For every `guardTower` structure that is ready (`Structure.nextShotAt`, server only), it looks at all players: not the owner or an ally (`areAllies`), alive (`RespawnSystem.isAlive`; a frozen disconnected player is still a target), within `TOWER_RANGE` (450 on-screen px, `screenDistance` from the tower's middle) and in line of sight past mountains (`hasLineOfSight`, shared with the bots). It fires at the nearest with `CombatSystem.spawnShot(state, ownerId, x, y, angle, GUN_DAMAGE.basic)` (the same projectile code `CombatSystem.fire` uses, now factored out), then waits `TOWER_FIRE_INTERVAL_MS` (1000: the Blaster's `GUN_FIRE_INTERVAL_MS`). The shot belongs to the tower's owner: kills count for them and their teammates are passed through. No ammo, no gun, no lead (`aimAngle(from, target, 0)`), players only. Both numbers are first-pass; the Blaster's damage is `GUN_DAMAGE.basic`, so nerfing the gun nerfs the tower. Tests: `TowerSystem.spec.ts` and `tools/e2e.js` → *Guard Towers*.

- Verified 2026-09-26 (those scripts have since become the server specs): `check-rules.js` (neighbors, flat-top 2-radius shape, corners on grid vertices, inside the footprint, no overlaps, every placement rule, all 7 hexes protected, hits inside/outside), `check-collisions.js`, `e2e.js` (a Farmer walks a footprint and builds over the wire), and in the browser (bots built a farm, mine and fort; the red/yellow preview; building a power plant through the UI, score +25).

### Movement

> Rules: [Players](GAME_DESIGN.md#players) and [Controls](GAME_DESIGN.md#controls).

Movement is continuous, at **any angle**, and eased rather than snapping between headings.

- **Server (`MovementSystem`)**: movement only happens during `playing` (velocities are zeroed in every other phase). Each tick, the target velocity is `dir × PLAYER_SPEED` (× 1.25 / 1.5 / 1.75 with Booster 1 / 2 / 3 equipped — `UpgradeSystem.speedMultiplier`; the Robot starts with Booster 1; acceleration is unchanged), where `dir`'s length is measured **on-screen** — `hypot(dir.x, dir.y × SCREEN_Y_SCALE)`, clamped to ≤ 1 with a small deadzone; magnitude scales speed, so an analog joystick can walk slowly. `SCREEN_Y_SCALE` (0.6, `server/src/constants.ts`) must equal the client's `ISO_SQUASH`. The effect: a full push straight up the screen is a world vector of length 1/0.6 ≈ 1.67 (≈ 333 world px/s) yet looks exactly as fast as one sideways (200 px/s), and the cap is an ellipse in world space, so a cheating client can't exceed top speed in any direction. `GameRoom.handleInput` accordingly allows world-y up to `1 / SCREEN_Y_SCALE`. Set `SCREEN_Y_SCALE = 1` for plain world-uniform speed. This (and projectile speed in `CombatSystem`) is where the server knows about the view's tilt — a deliberate tradeoff: it means the same on-screen speed for everyone at the cost of moving farther in world units vertically (crossing the map top-to-bottom, 3,575 world px, takes about 10.7s vs 15.4s left-to-right). Actual velocity moves toward the target by at most `PLAYER_ACCEL × dt` (1200 px/s²) — the *same* limit applies when speeding up, stopping, and turning, so a full reverse takes a fraction of a second instead of flipping instantly. Then `position += velocity × dt`, clamped to the map rectangle (velocity is zeroed on the axis that hit the edge). `vx`/`vy` are synced so clients can extrapolate. Verified with a script: ramp to 200 px/s in ~4 ticks, headings ease from 45° to −73° over ~5 ticks, and a stop takes ~4 ticks.
- **Input is a world-space vector plus a facing angle**, so the server is agnostic to how the client derived it. The server keeps only the *latest* input per player (overwrite, not a queue).
- **Stale input is dropped.** If no input arrives for `INPUT_STALE_MS` (750ms) the player is treated as pressing nothing and coasts to a stop. Without this, a client that goes silent — a backgrounded browser tab pauses Phaser's loop, or the connection stalls — leaves the player running in their last direction indefinitely (found and fixed 2026-09-20). Clients therefore re-send at least every 250ms while active.
- **Right-click to move (desktop):** the client stores a world-space target and walks toward it by driving the same `input` vector the keys would, so the server is unchanged; a ring on the ground marks it. It eases off over the last `TARGET_SLOW_DISTANCE` (80 world px) so the player stops on the spot — measured 2026-09-20: a 300 px trip took 2.0 s, ramped to 200 px/s, stopped 9 px from the target with no overshoot. The target clears on arrival, when there's no progress for `TARGET_STUCK_MS` (1.2 s — e.g. the spot is inside another player's structure or off the map), or on any movement key or joystick input. The browser context menu is disabled on the canvas.
- **Desktop controls (client)**: `W`/`A`/`S`/`D` (or arrows) move in fixed **on-screen** directions, combined and normalized so diagonals aren't faster; the mouse only aims and shoots. The alternative scheme (forward toward the cursor, `A`/`D` strafe) is still available with `MOVE_RELATIVE_TO_AIM = true` in `client/src/game/constants.ts`; see [GAME_DESIGN → Controls](GAME_DESIGN.md#controls) for why it isn't the default. Speed is uniform in *screen* space (`UNIFORM_SCREEN_SPEED = true`, see the Server bullet above); set the flag to `false` for the physically-uniform-on-the-ground alternative, where straight up/down looks ~40% slower. **Mobile**: the joystick gives an on-screen vector that is `unproject`ed to world space, so the character moves where the stick points on screen; facing follows the movement direction.
- **Smoothness on the client**: see [Client — Phaser Game](#client--phaser-game) — rendered positions chase server state with frame-rate-independent smoothing plus a little velocity extrapolation. There is **no client-side prediction yet**, so your own input still takes about one round trip plus a server tick to show up (imperceptible on localhost, noticeable at 100ms+ latency). Prediction with reconciliation is the next step for latency hiding.

### PvP Shooting

> Rules: [Combat](GAME_DESIGN.md#combat).

- Client sends `shoot` message with an angle; server rejects it outside the `playing` phase, if the player has no gun (`Player.gun === ''`), or if they're out of `ammo`
- **No friendly fire:** projectiles pass through the shooter's allies and their structures (`areAllies`; see [Lobby, characters and teams](#lobby-characters-and-teams))
- Server spawns a `Projectile` in state at the shooter's current position, decrementing `ammo` by 1. There is no ammo regeneration or reload (an open design question).
- `CombatSystem` advances all projectiles each tick, checks collision against players and structures, and removes projectiles on hit, out-of-bounds, or after the shot's own lifetime (`Projectile.lifetimeMs`, server only: `GUN_SHOT_LIFETIME_MS` of its gun, 2 s for the Blaster and the towers (`PROJECTILE_LIFETIME_MS`) and 4 s for the Ion Cannon; tracked via `Projectile.spawnedAt`, not wall-clock elapsed time inferred from ticks)
- **Projectile speed is on-screen, like player movement.** A projectile's `speed` (`PROJECTILE_SPEED`, 600 since 2026-09-27; 400 before) is measured with world y scaled by `SCREEN_Y_SCALE`, so a shot fired up or down the screen moves ~667 world px/s vertically and looks exactly as fast as one fired sideways (400 world px/s). `CombatSystem` divides the heading `(cos, sin)` by its on-screen length `hypot(cos, sin × SCREEN_Y_SCALE)`; the client mirrors this in `projectileWorldVelocity` to extrapolate between ticks. Side effects: vertical shots travel farther in world units over their 2s lifetime (about 1,333 vs 800 px), and they cover ~33 world px per tick vs 20 sideways — see the swept hit test under [Collision Detection](#collision-detection).
- **Damage comes from the shooter's gun** (`GUN_DAMAGE` in `shared/types.ts`). It's stamped on the projectile when fired (`Projectile.damage`), so it applies to players and structures alike. Health is `BASE_MAX_HEALTH` plus `ARMOR_HEALTH_PER_LEVEL` per Armor level; respawns restore `maxHealth`. **The two guns' shots look different** (client, 2026-09-26, told apart by the synced `Projectile.damage`): see `BASIC_SHOT_*` / `BIG_SHOT_*` in `client/src/game/constants.ts`. Only the drawing differs; the hit radius is the same.
- On a killing blow, the shooter's `kills` increments and the target is **defeated** (`RespawnSystem.defeat`, below) rather than eliminated. Defeated players (`respawnAt > 0`) are skipped by hit detection, so shots fly on through where they fell, and `fire` refuses them.

### Defeat, respawn and backpacks

> Rules: [Players](GAME_DESIGN.md#players) (death, respawn and backpacks). Added 2026-09-29, replacing the instant respawn.

**Feature flag (2026-10-03):** `BACKPACKS_ENABLED` in `server/src/constants.ts` is **false by default** (`BACKPACKS=1` turns it on, `0`/`false`/`off` off, like `PICKUPS`). `GameRoom.onCreate` copies it into the server-only `GameState.dropBackpacks`, and `RespawnSystem.defeat` reads that: with it off, no backpack is made and the player's gun, ammo and upgrades are left alone (they still go down for `RESPAWN_DELAY_MS` and come back with full health). Everything below describes the flag-on behavior; the specs that exercise it set `state.dropBackpacks = true`, and `tools/e2e.js` runs its backpack scenario with `BACKPACKS=1` and a separate scenario for the default.

**Respawn where you died (2026-10-03):** `RESPAWN_WHERE_DIED_ENABLED` (default **true**; `RESPAWN_WHERE_DIED=0` turns it off) is copied into the server-only `GameState.respawnWhereDied`. `RespawnSystem.respawn` then leaves the player where they fell, unless `dropHex` (the backpack's search: walkable on foot, outside every enemy structure) says that hex is no good, in which case it moves them to the center of the hex it finds; with the flag off it uses `spawnPoint(state, player.spawnSlot)` as before.

**Spawn zones (2026-10-03):** `server/src/spawnZones.ts`: a player's zone is `spawnTileX/Y` and its six neighbors. `CollisionSystem.claimTiles` skips any hex in the zone of a player who isn't the claimer or an ally (`isSpawnZoneOfOther`). Because structures need every hex owned, nobody else can build on or touching one. The bots' `claimValue` treats those hexes as worthless (`Search.unclaimable`, built with `otherSpawnZones`) and `findBuildSite` skips sites that would need one.

**Spawn safe area (2026-10-03):** `SPAWN_SAFE_RADIUS` (6 hexes, was `BOT_SPAWN_MERCY_RADIUS` = 3) is how far from a player's own spawn hex (`spawnTileX/Y`) they count as safe (`RespawnSystem.inSpawnSafeArea`). `TowerSystem` doesn't target such a player, and `CombatSystem` lets a projectile with the server-only `fromTower` flag pass through them; bots' `isFairGame` uses the same radius.

- **`RespawnSystem.defeat(state, player)`** (from `CombatSystem` on a killing blow): if the player has a gun, ammo or any upgrade level, a `Backpack` is made on the hex they fell on. That's `dropHex`: the first hex from there, by breadth-first search, that's walkable on foot and outside every enemy structure's footprint (they may have been flying over terrain with the Jetpack that are now in the backpack). It stores the gun, ammo, the four levels and the equipped upgrade as server-only fields. The player's gun, ammo, levels and equipped upgrade are cleared (`applyUpgradeEffects`, so Armor's max health goes too), health goes to 0, velocity to zero, and `respawnAt` = now + `RESPAWN_DELAY_MS` (5 s; not scaled by `PHASE_TIME_SCALE`). Materials, the structure inventory, tiles and kills aren't touched.
- **While down** (`respawnAt > 0`, `RespawnSystem.isAlive` false): `MovementSystem` holds them still, `CollisionSystem` doesn't claim for them, `PickupSystem` doesn't open pods for them, `CombatSystem` doesn't hit them and `fire` refuses, and `StructureSystem.place` refuses. Fabricating (`ShopSystem.purchase`) is still allowed. `CharacterSystem.apply` resets `respawnAt` at match start.
- **Respawn grace period** (2026-10-03): `RespawnSystem.respawn` sets the synced `Player.graceUntil = now + RESPAWN_GRACE_MS` (5 s, scaled by `PHASE_TIME_SCALE`), and `RespawnSystem.inGrace(player, now)` says whether it is still running. While it is: `CombatSystem` lets projectiles pass through the player, `TowerSystem` doesn't target them, and the bots' `isFairGame` rules them out for both shooting and chasing. The client (`GameScene.graceAlpha`) multiplies the player's opacity by a sine wave between 0.5 and 1 with a period of `GRACE_BLINK_MS` (300 ms) while `graceUntil` is in the future (it compares against the client's `Date.now()`, like the respawn countdown).
- **`RespawnSystem.update`** (each tick, after `PickupSystem`): anyone whose `respawnAt` has passed is moved to `spawnPoint(spawnSlot)` with full health and `respawnAt = 0`. Then, during `playing`, a connected player in play standing on (`pixelToHex`) the hex of one of *their own* backpacks takes it back. `restore` gives the better gun (`basic` < `big`), each level as the max of theirs and the backpack's, the ammo added, and the equipped upgrade only into an empty slot, then runs `applyUpgradeEffects` and adds Armor's extra max health to health. The backpack is deleted, and `backpackCollected { contents }` goes to that player only, through the `Notify` callback GameRoom passes in (`notifyPlayer` finds their client; bots have none).
- **Only the owner sees it:** `GameState.backpacks` is a `@view()` field. Every client gets a `StateView` in `onJoin` with the root state added (so the field exists for it), and `GameRoom.showBackpacks` (end of each tick) adds each backpack to its owner's view. Clients without the backpack in their view are never sent it, and a deleted backpack leaves every view by itself. What's inside is never synced, not even to the owner. `GameState.spec.ts` round-trips this through the encoder the way Colyseus's serializer does (the shared patch, then each view), and `tools/e2e.js` checks it over a real server.
- **Client:** `GameScene` draws your backpacks (`backpacks.onAdd`/`onRemove`, and those present at create) as a container at the projected hex center: a ground ring (`drawBackpackRing`, pulsing every `BACKPACK_RING_MS`), a shadow, and the backpack (`drawBackpack` in `game/backpack.ts`, scaled `BACKPACK_SCALE`, lifted `BACKPACK_LIFT`). A player whose `respawnAt > 0` isn't drawn (`container.setVisible`). The camera follows your own container, so it stays where you fell, and the respawn jump snaps rather than glides (`SNAP_DISTANCE`). `RespawnOverlay` (in `GameScreen`) counts down to your `respawnAt` with `usePhaseCountdown` and, if `room.state.backpacks` has anything, says where your gear went. `GameContext` turns `backpackCollected` into a "Got your backpack back: …" notice, and its roster signature includes `respawnAt`.
- **Bots:** a down bot gets a zero input and does nothing but fabricate. Once back, its `think` goes for the nearest of its own backpacks (goal `recover`: `planRouteToward` up to `RECOVER_DEPTH`, 30 steps, re-planned as it goes), after chasing and before building. It skips any backpack with an armed enemy within its `range` of it. `isFairGame` leaves down players alone. `tools/bot-sim.js` runs `RespawnSystem.update` like the room does.
- **Tests:**
  - `systems/RespawnSystem.spec.ts`: what's dropped and what's kept; no backpack when there's nothing to drop; the drop moved off deep water, and never into an enemy structure; nothing possible while down; respawning at exactly the delay; only the owner, and only once in play, taking it back; the merge rules and the private notice.
  - `CombatSystem.spec.ts`: a kill defeats rather than respawns; down players can't be hit or fire; Armor is dropped.
  - `BotSystem.spec.ts`: a bot sits out, respawns, walks back and recovers its gun; bots ignore down players.
  - `GameState.spec.ts`: the view. Client: `RespawnOverlay.spec.tsx`.
  - `tools/e2e.js` → *Defeat, respawn delay and backpacks*, with two real clients: down with the Booster gone; the backpack sent to its owner only; can't move while down; respawn at 5 s at the spawn; walking back restores the Booster, with a private notice.
  - Browser, 2026-09-29: the overlay, the backpack on the hex where the player fell (not drawn for anyone else), and taking it back.
- Server broadcasts `playerHit` on every hit (not just kills); client should use this to play a hit effect

### Score

> Rules: [Scoring and winning](GAME_DESIGN.md#scoring-and-winning).

`ScoreSystem` recomputes every player's `Player.score` each tick from current state (`server/src/constants.ts`):

`score = tilesOwned × TILE_POINTS (1) + kills × KILL_POINTS (0, since 2026-10-03) + Σ structurePoints(type, owner's character) over the structures owned`

- Score is *derived*, not accumulated, so it drops when tiles or structures are lost. `kills` is a counter that never decreases.
- Structure points come from `STRUCTURE_SPECS[type].points` through `structurePoints(type, character)` in `shared/types.ts` (farm 100, fabricator 100, power plant 100, Guard Tower 50; a player's *specialty* is `SPECIALIST_STRUCTURE_POINTS` = 150 instead: `SPECIALTIES` maps `farmer` → farm, `engineer` → fabricator, `scientist` → power plant). `STRUCTURE_POINTS` (a flat 25) was removed 2026-10-03.
- Colyseus syncs a field only when its value changes, so recomputing every tick costs nothing on the wire. The client's `scoreFor()` just reads `Player.score`.
- Verified with scripts (10 tiles + 2 kills + 2 structures + 9999 materials = 160; losing a structure → 135) and end to end with two clients (6 tiles → score 6; building a structure → +25).

### Shop

> Rules, items and prices: [Economy and fabrication](GAME_DESIGN.md#economy-and-fabrication). **Players see this as the Fabricator** (since 2026-09-27; its button, or `F`): items are fabricated from materials. The code keeps its shop names — `SHOP_ITEMS`, `ShopItemId`, `ownsShopItem`, `ShopSystem`, the `purchase` message — so read "shop" in code as "fabricate".

Buying works through one message, `purchase { itemId }`, handled by `GameRoom.handlePurchase` → `ShopSystem.purchase(player, itemId, hasFabricator)`. **Guns setting (2026-10-03):** `GameSettings.guns` (default **false**; the Create game screen's Guns choice, cleaned by `normalizeGameSettings`) is synced to clients as `GameSettingsState.guns` and listed in the game metadata and `GameListing`. (It began as a server flag, `GUNS_ENABLED`, and became a setting the same day.) With it off: `ShopSystem.purchase(player, itemId, hasFabricator, canHold, gunsEnabled)` refuses guns and ammo (`isGunItem` in `shared/types.ts`: any item with `gun` or `ammo`; `GameRoom.handlePurchase` passes `state.settings.guns`); `rollPickup(..., gunsEnabled)` leaves `ammo`, `basicGun` and `bigGun` out of the pod roll; `nextPurchase` (`needs.gunsDisabled`) skips guns and ammo in a bot's list; and the client reads `settings.guns` to hide the Weapons section, gun/ammo lines (`UpgradesPanel`, `HUD`, the lobby `CharacterCard`) and the FIRE button. Guard Towers are unaffected (`TowerSystem` spawns shots with no gun or ammo). Specs build their worlds with guns on (`world(phase, { guns })` in `server/src/test/world.ts`); `tools/e2e.js`'s `join` creates games with guns on unless told otherwise (see the *Guns game setting* scenario). **The Fabricator gate (2026-10-03):** `handlePurchase` passes `StructureSystem.hasFabricator(state, player.id)` (an owned, standing fabricator), and `purchase` refuses every item that isn't a structure without one, so guns, ammo and upgrades need a Fabricator while structures never do (the first one has to be bought somehow). `Player.hasFabricator` mirrors it to the client, which grays out the Fabricator button and ignores `F`. Pods (`ShopSystem.grant`) skip the gate. It is allowed in the `playing` phase only (there's no separate shopping phase since 2026-09-26), for connected players. The server re-validates everything (unknown ids, materials, ownership); the client's disabled buttons are just a convenience.

Rebuilt 2026-09-26 as a data-driven catalog: each `SHOP_ITEMS` entry has a `category` (the menu groups by it) and says what it gives — a `gun`, `ammo`, an `upgrade` or a `structure` — and `ShopSystem.purchase` just applies that. The client splits the catalog by category: `FabricatorMenu` lists Weapons and Upgrades, and the **Build menu** (`components/BuildMenu.tsx`, button or `B`) lists the Structures category (cost, points via `structurePoints`, health, how many you hold and a Place button), shows materials and "Tiles: x / y", and is never locked. `ownsShopItem` (shared, so the server and the menu agree) says when buying would get you nothing: an upgrade you already have, or a gun that isn't better than yours.

- **Adding an item:** a new entry in `SHOP_ITEMS`. A new *kind* of effect also needs a line in `ShopSystem.purchase`.
- **Upgrades** (levels and the one slot, 2026-09-26; rules in [GAME_DESIGN.md → Upgrades](GAME_DESIGN.md#upgrades)): `UPGRADES` in `shared/types.ts` lists each upgrade's name, `maxLevel`, whether it uses the slot and its `cost` a level (100; the Jetpack's is 200; shop entries read it). Display names are Booster, Harvester (id `expander`), Armor and Jetpack (id `wings`) since 2026-10-03, the ids and the `expanderLevel` / `wingsLevel` fields being unchanged. `UpgradeSystem.speedMultiplier` adds `JETPACK_SPEED_BONUS` (= one Booster level, +33%) while the Jetpack is the equipped slot upgrade; levels are plain `Player.<id>Level` fields (not a map, so they sync like any field and fit the shared `implements` check), with `equippedUpgrade` (`upgradeSwitchReadyAt` held the switching cooldown until 2026-09-27). Shop entries are one per upgrade (`upgradeItem`); `ownsShopItem` is true at the top level, and `shopItemTitle` / `shopItemDescription` show the level on offer. `server/src/systems/UpgradeSystem.ts` owns the effects: `applyUpgradeEffects` sets `maxHealth` (Armor, always on) and `claimRadius` (Harvester, when equipped); `speedMultiplier` (+`BOOSTER_SPEED_PER_LEVEL` per equipped Booster level, −`EXPANDER_SLOW_PER_LEVEL` per equipped Harvester level) and `canFly` are read by `MovementSystem`; `levelUp` (from `ShopSystem.purchase`) raises a level and equips a slot upgrade bought into an empty slot; `equip` handles the `equipUpgrade` message — owned slot upgrades or `''` only, instantly (no cooldown since 2026-09-27), not a no-op, and not taking the Jetpack off over solid terrain. For Armor, `purchase` also adds the rise in `maxHealth` to current `health`, so a hurt player keeps their damage but gains the headroom. The client sends `equipUpgrade` from the inventory popup (`Inventory.tsx`, below).
- **Shared catalog:** the item list, prices and what each gives live in `SHOP_ITEMS` (plus `AMMO_PACK_SIZE`, `AMMO_MATERIALS_PER_SHOT`, `STRUCTURE_SPECS`, `GUN_DAMAGE`, `ownsShopItem`) in `shared/types.ts`, the one copy both sides import. Server logic and the menu both read prices from it, so they can't disagree. `BASE_CLAIM_RADIUS`, `EXPANDER_CLAIM_RADII` and `BASE_MAX_HEALTH` are server constants (the per-level numbers shown in the shop are shared); the client only sees the resulting `Player.claimRadius` / `maxHealth` (and uses the shared base radius to decide when to show the circle).
- **The circle** (`GameScene.updateClaimRing`): an ellipse of the claim-radius diameter, squashed by `ISO_SQUASH` like everything on the ground (160×96 scene px for 80 world px), filled with the player's color at `CLAIM_RING_FILL_ALPHA` and outlined at `CLAIM_RING_STROKE_ALPHA`, at depth −0.4 so it sits above the terrain but under every entity. It's created when the radius exceeds the base, resized if the radius changes, and destroyed with the player.
- Verified: unit script (affordability, ammo math, second Harvester rejected, junk ids like `__proto__`/`toString`/`null` rejected with materials untouched); browser (buying ammo took materials 100 → 70 and ammo 30 → 60, and the Harvester button disabled at 70; buying the Harvester at 100 left "Owned", the ring appeared in the player's color at 128×77, and a short walk claimed a two-hex-wide swath).

### Economy (Materials)

> Rules: [Economy and fabrication](GAME_DESIGN.md#economy-and-fabrication).

- **Income is per first claim** (2026-09-27; every claim paid from 2026-09-26): `CollisionSystem.claimTiles` adds `MATERIALS_PER_CLAIM` (1) to `materials` when it hands a player a hex whose `Tile.claimedBefore` is false, and sets it. `claimedBefore` is a plain, non-synced field on the `Tile` schema class (like `Player.spawnSlot`): it's never cleared, so re-taking an enemy's hex or a hex released by `cleanupPlayer` pays nothing. The previous owner keeps what they earned. Claiming only runs during `playing`, so income does too. The timed payout (`EconomySystem.update`, `CREDIT_PAYOUT_INTERVAL_MS`, the synced `GameState.nextPayoutAt`) was removed.
- Starting materials are set by `CharacterSystem.apply` from the character's kit (`STARTING_MATERIALS` was removed 2026-09-26).
- No discrete broadcast event for income — `Player.materials` is a plain synced field, so clients see it update via the normal state delta, the same way `x`/`y`/`health` do
- **Dev only (temporary):** the client's `M` key (only when `import.meta.env.DEV`, i.e. the Vite dev server) sends `devMaterials` (no payload, via `sendDevMaterials` in `net/GameConnection.ts`); `EconomySystem.grantDevMaterials` adds `DEV_MATERIALS` (500) during `playing`, unless `DEV_CHEATS_ENABLED` is false (`NODE_ENV=production`). Covered by `EconomySystem.spec.ts` and an e2e check. Remove before release.
- Material piles are the other source (see *Pickups*).
- Spending is the only sink: materials leave when a purchase succeeds (`ShopSystem.purchase`). Nothing else consumes them.

### Pickups

> Rules: [Pickups](GAME_DESIGN.md#pickups). Added 2026-09-27.

- **Guns setting:** with `GameState.settings.guns` off, `PickupSystem` passes it to `rollPickup`, which never rolls ammo or a gun (see *Shop*).
- **Feature flag:** `PICKUPS_ENABLED` in `server/src/constants.ts` (default on); the `PICKUPS` environment variable overrides it (`0`/`false`/`off`, or `1`). Off means `onCreate` never fills `state.pickups`, so everything downstream (the system, the client) has nothing to do. The client has no flag of its own: it draws whatever is in `state.pickups`.
- **Placement** (`server/src/pickups.ts`, `generatePickups(terrain, cols, rows, random)`): one pod per cell of a `PICKUP_GRID` (4 × 3) over the hex grid (row-major cell numbers; `PICKUP_EMPTY_CHANCE` % of cells get none), starting at the cell's center plus up to `PICKUP_JITTER` (2) hexes each way, then a breadth-first search for the nearest hex that's ground, outside every spawn area (`SPAWN_CLEAR_RADIUS` of each `spawnHexes` hex), and not already used. Options: `cells` (which cells to fill) and `blocked` (extra hexes to avoid). Returns `PodSpot`s (hex plus cell) only; at the start it runs after terrain on the same seeded stream, so a seed reproduces both.
- **Respawn waves** (`PickupSystem.respawn`, each tick while playing): the first wave is at match start (`phase.endsAt − MATCH_DURATION_MS`) + `PICKUP_RESPAWN_MS` (170 s), then every `PICKUP_RESPAWN_MS` (`GameState.nextPodWaveAt`, server only). A wave calls `generatePickups` for the cells with no pod on the map or waiting (the server-only `Pickup.cell`), with `blocked` = hexes holding a pod or in a structure footprint, and queues each as a `PendingPod` in `GameState.pendingPods` (server only) with `appearsAt` = now + random × `PICKUP_RESPAWN_DELAY_MAX_MS` (15 s). A pending pod appears when due, unless its hex has become blocked. Both times scale with `PHASE_TIME_SCALE`. Nothing runs when the room never had pods (`podsMade === 0`, i.e. the flag was off).
- **State:** `Pickup` schema is just `id`, `tileX`, `tileY` (plus the server-only `cell`); ids come from `GameState.podsMade` in `GameState.pickups`, a `MapSchema`; `PickupState` in `shared/state.ts`. **Contents are never synced** (2026-09-27; before that each pickup carried `kind`/`itemId`/`amount` and was drawn by type), so a client can't tell pods apart.
- **Opening** (`PickupSystem.update`, after `CollisionSystem` each tick, `playing` only): a connected player whose `pixelToHex(x, y)` is a pod's hex opens it. `scoreTier(everyone's scores, their score)` ranks them (ties share the average place) and maps that onto 0–3; `rollPickup(tier, player, random)` rolls that row of `PICKUP_TIER_CHANCES` after dropping outcomes they can't use (`usable`: blaster only unarmed, ion cannon unless owned, an upgrade only if one is still at level 0), then picks the amount, the missing upgrade or the structure type. Materials and ammo are added; items go through `ShopSystem.grant` (auto-equip into an empty slot, Armor's health). The pod is deleted and `pickupCollected` broadcasts the contents. `random` is injectable for tests.
- **Client:** `GameScene.addPickupView` (on `pickups.onAdd`, and for those present at create) builds a container at the projected hex center: a shadow ellipse, a glow `Graphics` (`drawDropPodGlow`) and the pod `Graphics` (`drawDropPod`, `client/src/game/pickups.ts`), scaled by `PICKUP_SCALE`, lifted `PICKUP_LIFT`, bobbing `PICKUP_BOB` px, with the glow's alpha pulsing every `POD_GLOW_MS`. Depth is the ground y, like players. `onRemove` kills the tweens and destroys it. `GameContext` turns `pickupCollected` for your own session into a "Picked up …" notice (`pickupLabel` in `shared/types.ts`). The pickups are Phaser vector graphics; the inventory bar's icons are SVG (`ItemIcon`).
- **Tests:** `pickups.spec.ts` (four tier rows adding to 100, better odds further down; each row's proportions over 20,000 rolls; amounts in range; unusable outcomes dropped and the rest rescaled; `scoreTier` for 1, 2, 4 and 10 players and ties; placement on 30 seeded maps: 12 pods, ground only, distinct, outside spawn areas; one per grid cell; moved off terrain; repeatable), `systems/PickupSystem.spec.ts` (opening once, the phase/connection/next-hex cases, the same roll giving the leader and the last player different tiers' contents, a respawn wave refilling only empty cells after the delay, a waiting pod dropped when a structure takes its hex, nothing with the flag off); `pickups.spec.ts` also covers the empty chance, `cells` and `blocked`, `GameState.spec.ts` (only position is synced), client `types/shared.spec.ts` (`pickupLabel`), and `tools/e2e.js` (12 pods on ground and the same for everyone, no contents in the synced state, walking onto the nearest opens it, `PICKUPS=0` gives none). Browser, 2026-09-27: the pod seen bobbing and pulsing, opened with its notice.

### Bots

> Rules: [Bots (single player)](GAME_DESIGN.md#bots-single-player). Added 2026-09-28.

- **A bot is a `Player` with no client:** `bot: true` and `botDifficulty` (both synced, so the lobby can show and edit them), an id `bot-N` (`GameState.botsMade`), always `connected` and `ready`. Everything that handles players generically (claiming, pods, combat, score, standings, the leaderboard, rendering) needs nothing special for them.
- **In the lobby** (`BotSystem.add` / `remove` / `configure`, from the `addBot` / `removeBot` / `updateBot` messages; `lobby` phase only, so the countdown can't change under anyone): `add` refuses at `SPAWN_SLOTS` (10, `MAX_PLAYERS` in `shared/types.ts`) players and gives the bot the first free `BOT_NAMES` name ("Bot Cassini", made unique by `LobbySystem.uniqueName`), `defaultTeam`, a random character, a spawn slot (`assignSpawn`, shared with `onJoin`) and a fresh brain. `configure` applies each valid field; a team goes through `LobbySystem.canTakeTeam`, the rule a person's pick uses. `LobbySystem.everyoneReady` needs at least one connected person.
- **Seats:** bots aren't clients, so `GameRoom.syncBotSeats` sets `maxClients` to `SPAWN_SLOTS` minus the bots after each add or remove. Colyseus 0.16's `maxClients` setter also updates the matchmaker listing and locks or unlocks the room, so a game that's full with bots can't be joined and drops out of `GET /games`. The listing metadata carries `bots`, and `listingsFrom` reports `players = clients + bots` and `maxPlayers = maxClients + bots`.
- **Brains:** `GameState.botBrains` (server only) maps each bot's id to a `BotBrain` (`bots/brain.ts`): its goal and route, timers, chase and shooting targets, and shopping progress. An entry whose player has gone is dropped.
- **Each tick** (`BotSystem.update`, `playing` only, after `LobbySystem` and before `MovementSystem`; it does nothing until `BOT_START_DELAY_MS` (2 s, scaled by `PHASE_TIME_SCALE`) after `GameState.playingStartedAt`, a server-only timestamp `PhaseSystem.transitionTo` sets when `playing` begins; 0 in tests that build a world directly, so no delay there), for each bot:
  1. **Think**, every `thinkMs` (±25%), or at once when it reaches the end of its route or respawns. Easy may dawdle (`idleChance`/`idleMs`). It keeps the right upgrade equipped (`equip`), then picks a goal. *Chase*: armed, above `retreatHealth`, and an enemy within `chaseRange`: route toward that enemy's hex. *Build*: holding a structure: `structureToBuild` picks what to place (a Fabricator, then a farm, then whatever it got first) and `findBuildSite(state, bot, radius, type, maxMissing)` finds the spot within 5 hexes (3 without `buildSites`) needing the fewest hexes claimed (every rotation of a Guard Tower is tried; at its tile limit, `maxMissing` is 0 because it can't claim more). If none are missing it places there at once (`StructureSystem.place`, with the site's `rotation`); with `buildSites` it routes to the nearest missing hex, giving up on a spot after 10 s for 8 s. *Claim*, otherwise: `planClaimRoute`, re-planned on arrival, every 2 s, or once its goal hex is its own.
  2. **Steer**: a stick input toward the center of the route's next hex (normalized on screen like a joystick, times `speed`). The last hex of a claim or build route only has to be stood on. In sight of its prey within `keepDistance`, it stops, or strafes sideways (on screen) if `strafe`. If it pushes for 700 ms but moves less than 8 px, it walks a random way for 450 ms and re-plans. The input goes into `playerInputs` with `receivedAt = now`, exactly like a client's, so `MovementSystem` moves bots under the same rules (speed and upgrades, terrain, enemy structures).
  3. **Shoot**: `pickTarget` takes the nearest enemy player within `range` (on-screen) in line of sight (`hasLineOfSight` samples the line for mountains every `SHOT_TERRAIN_STEP`, like shots do), skipping anyone within `BOT_SPAWN_MERCY_RADIUS` of their own spawn hex; failing that, with `shootStructures` and more than half of `ammoLow` in ammo, the nearest enemy structure. It fires (`CombatSystem.fire`) once the same target has been in its sights for `reactionMs` and `max(fireIntervalMs, the gun's GUN_FIRE_INTERVAL_MS) × BOT_FIRE_INTERVAL_FACTOR` (2, since 2026-10-03: half the rate) has passed, at `aimAngle` plus `aimWobble(aimError)`. `aimAngle` solves the intercept in screen space, where shots have one speed in every direction, allowing for `lead` of the target's velocity. A bot faces where it last fired, else where it's walking.
  4. **Fabricate**, every `shopMs`: `nextPurchase(player, profile, structuresBought, needs)` (`bots/shopping.ts`), then `ShopSystem.purchase`. Before the list: a Fabricator when it owns none (and until then it skips gear), a farm once within `FARM_MARGIN` (150) hexes of its tile limit, and from `RESERVE_MARGIN` (250) hexes out a farm's price (100) is held back from every other purchase, because a bot at its limit earns no materials and could otherwise never afford one. Then ammo when it has a gun and fewer than `ammoLow` shots. Then it's the first unfinished `shopPlan` entry: an upgrade listed k times is done at level k, a gun once owned, and the k-th structure entry once it has fabricated k Guard Towers (the forced Fabricators and farms don't count). With `saveUp` it waits until it can afford that entry; otherwise it takes the first affordable one after it. Once the list is done, `keepBuilding` fabricates a Guard Tower whenever it has none to place.
- **Navigation** (`bots/navigation.ts`) is a breadth-first search over hexes from the bot's hex. It skips hexes off the map, enemy structure footprints, and solid terrain (unless its Jetpack are on). Solid terrain comes from `walkableGrid`, built once per room with `blocksWalkingAt` and cached in a `WeakMap`. `planClaimRoute` scores every hex within `searchDepth` steps: its claim value (fresh ground 3; ground claimed before, or an enemy's, 2; its own, a teammate's, terrain or protected 0), plus 20 for a drop pod, plus 0.3 × its neighbors' values (so open ground wins). That is divided by steps + 1, gets up to +30% for hexes ahead of the bot, and is multiplied by 1 + `goalNoise` × random. If nothing in reach is worth anything, an unlimited search finds the nearest valuable hex it can *walk* to, so a wall between it and unclaimed ground is walked around, not pushed against.
- **Backpacks** (2026-09-29): see *Defeat, respawn and backpacks*. Down bots wait, then go back for their own backpacks unless they're guarded.
- **Shared code paths:** shooting and placing moved out of `GameRoom` into `CombatSystem.fire` and `StructureSystem.place` (2026-09-28), so people and bots go through the same checks. Projectile ids come from `GameState.shotsFired`.
- **Cost** (`tools/bot-sim.js`, which runs the tick without networking): about 0.3 ms a tick for 3 bots on a Small map and 0.9 ms for 9 on a Large one, against a 50 ms tick. The slowest single ticks (15–22 ms) are the first ones (JIT warm-up) and whole-map fallback searches.
- **Tuning:** the numbers are `BOT_PROFILES` in `server/src/constants.ts` (each field is commented there; the rules doc has them as a table). `node tools/bot-sim.js [difficulties] [minutes] [seed] [mapSize] [teams]` plays a headless match on a virtual clock (5 minutes in ~2 s) with the real systems, and prints each bot's score, hexes, kills, structures, kit and the tick cost. A seed repeats the same map and match, so profiles can be compared.
- **Tests:** `systems/BotSystem.spec.ts` (fake timers): adding, refusing and naming bots; `configure`, including a taken color; removing, and never removing a person; that bots alone don't start a match; claiming, with each harder difficulty claiming more; getting out of a mountain ring through its one gap; placing a held structure, and working toward a spot then building; fabricating; firing only after the reaction time, and hitting; no shots through mountains, at teammates or into spawn areas; chasing to the keep-distance. Also `bots/navigation.spec.ts`, `bots/aim.spec.ts` (a led shot meets targets moving in any direction), `bots/shopping.spec.ts`, and `games.spec.ts` (listing counts). `tools/e2e.js` → *Bots*, over a real server: add, update and remove; list counts; a room full with bots is locked and reopens after a remove; the match starts with one person; bots move and claim; no adding once the match is on. Browser, 2026-09-28: the lobby at desktop and 375 px, and matches against three bots.

---

## Client — React Shell

### Networking layer — implemented and verified 2026-09-19

The client's networking code is built and has been exercised end-to-end against the live server (see the Tech Stack note): join, full-state decode, reactive state callbacks, `startGame`, `input`/`inputAck`, movement, and `tilesClaimed` all confirmed working. It's split into three pieces:

- **`src/types/shared.ts`** — re-exports `shared/types.ts`, the client/server message contract (one copy, shared with the server).
- **`src/types/gameState.ts`** — plain TypeScript interfaces (`PlayerState`, `TileState`, `ProjectileState`, `StructureState`, `GameStateShape`, etc.) describing the shape of the decoded root state, typed as `ReadonlyMap`/`readonly T[]` rather than importing the server's schema classes. `colyseus.js` decodes `@colyseus/schema` state by **reflection** at connect time, so the client never needs the server's actual `Schema` subclasses — these interfaces exist purely for TypeScript, and the real decoded `MapSchema`/`ArraySchema` instances satisfy them structurally at runtime.
- **`src/net/GameConnection.ts`** — a thin wrapper around `colyseus.js`'s `Client`/`Room`: `connectToGame(handlers)` joins (or rejoins via a `sessionStorage`-persisted `reconnectionToken`) the `GameRoom` and wires up discrete server→client message handlers; `sendInput`/`sendShoot`/`sendPlaceStructure`/`sendStartGame` are typed send helpers; `leaveGame`/`clearReconnectionToken`/`isNormalClose` support a clean, consented leave. High-frequency gameplay state (positions, tile ownership) is **not** modeled as discrete messages — it's plain Colyseus state, read directly off `room.state` by the Phaser layer's render loop — see [Client — Phaser Game](#client--phaser-game).
- **`src/main.tsx` must wrap `<App />` in `<GameProvider>`.** `useGameConnection()` throws if there's no provider above it, and because `App` calls it on its very first render, omitting the wrapper produces a completely blank page (React unmounts the tree; the only trace is an uncaught `useGameConnection must be used within a GameProvider` in the console). This was the cause of the "dev server runs but no UI" report on 2026-09-20.
- **Wait for the first state before publishing the room.** `client.joinOrCreate()` resolves when the join handshake completes, but the server's initial full-state message is decoded a moment *after* that — so right after the promise resolves, `room.state.phase` is still `undefined`. `GameContext.connect()` therefore checks `room.state?.phase` and, if it's missing, awaits `room.onStateChange.once(...)` before calling `setRoom`/`setStatus('connected')` or reading any state. Consumers (lobby, `GameScreen`, HUD) can rely on `room.state` being fully populated whenever `status === 'connected'`. (Earlier smoke-test scripts worked only because they awaited a state change explicitly.)
- **`src/context/GameContext.tsx`** — a React context (`GameProvider` / `useGameConnection()`) that owns the connection lifecycle: `status` (`idle` / `connecting` / `connected` / `reconnecting` / `error`), the current `room`, `sessionId`, `phase`/`phaseEndsAt` (kept in React state via the `phaseChanged` message, since phase changes are low-frequency and worth a re-render), a `players` array kept in sync via `getStateCallbacks(room)` reactive `onAdd`/`onRemove`/`onChange` callbacks (also low-frequency — a HUD/lobby list, not a per-tick render), and `gameOver`. It automatically retries via the reconnection token on an unexpected drop (any `onLeave` code other than `1000`, the consented-leave code), with a fixed retry delay — not implemented yet: a max-attempts cutoff or backoff, worth adding before this ships. `connect()`/`leave()` are exposed for a lobby screen to call, and `input`/`shoot`/`placeStructure`/`startGame` are the typed action dispatchers.

### Screen routing and the start screens — reworked 2026-09-27

`App.tsx` picks the screen from the URL until you're in a game, then from the game's phase. The URL is read by `utils/route.ts` (`parseRoute`, `navigate` with `history.pushState`, `useRoute` listening to `popstate` and its own event; no router library):

| Path | Screen |
|---|---|
| `/` | `SplashScreen`: title over placeholder art (CSS gradients and a hex pattern), a pulsing **Play** button |
| `/play` | `GamesScreen`: **Create game** first, a filter (`utils/games.ts` → `filterGames`, code or name), and the list from `fetchGames()` (`GET /games` on `SERVER_HTTP_URL`, the ws URL with http), re-fetched every 3 s; a typed full code that isn't listed gets a "Join game CODE" row |
| `/play/new` | `CreateGameScreen`: name and the settings (`DEFAULT_GAME_SETTINGS`): map size and game length as radio `Choices`, then Teams, Drop pods and Guns as `ToggleRow`s (a `role="switch"` button styled as an iPhone switch, plus a [?] button whose `role="tooltip"` shows on mouse hover or when pinned by click/tap; blur or Esc closes it; the CSS is in `menuStyles.ts`), then `connect({ create: settings })` |
| `/game/CODE` | Joins the game once per visit (`connect({ join: CODE })`, `JoiningScreen` meanwhile or with the error and "Try again") |

```typescript
// App.tsx (simplified)
if (gameOver || (connected && phase === 'results')) return <ResultsScreen />; // Play again → /play, Main menu → /
if (connected) return phase === 'lobby' || phase === 'countdown' ? <LobbyScreen /> : <GameScreen />;
switch (route.page) { /* game → JoiningScreen, create, games, splash */ }
```

While connected, an effect keeps the address at `/game/<room id>` (`replaceState`), so after creating a game, or when a saved reconnection token put you back in a different game than the URL asked for, the URL is right and can be shared. `GameContext.connect(target)` remembers the target for reconnect retries; `connectToGame` still tries the saved reconnection token first, then `joinById(code)` or `create('GameRoom', { name, game })`. The context also exposes `gameCode` and `settings` (copied once from `room.state.settings`). The old status line ("Status: idle") is gone: connection progress shows on the joining/create screens, and errors there.

The menu screens (game list, Create game, joining) share `screens/MenuHeader.tsx`: a three-column grid with the back button left, "SECTOR 42" centered and an empty `right` slot reserved for a settings button; their CSS is `screens/menuStyles.ts`. `JoiningScreen` rewords the server's "room … not found". The lobby uses `MenuHeader` too (**← Leave** to `/play`) and shows the game's name, code (with **Copy link**, `navigator.clipboard`) and a settings line. With `settings.teams` off the Team select is labeled **Color** and colors other players have are disabled "(taken)"; `LobbySystem.selectTeam` refuses a taken color on the server (with teams on, colors are shared as before). On phones (≤ 560 px) your row is two columns: your name, then the color/team and character selects side by side, then Ready; other players' rows (`lobby-row--other`) are one line — name with color dot, character, ready — and their team cell is only rendered when teams are on (an empty cell keeps the desktop columns aligned). Every menu screen (splash, game list, Create game, joining, lobby, results) ends with `MenuFooter` ("© 2026 kenecaswell"); `.menu-screen` is a flex column whose content grows (`flex: 1 0 auto`), so the footer sits at the bottom with a margin above it, or below long content. Vite's dev server serves `index.html` for these paths; hosting needs the SPA rewrite in `docs/HOSTING.md` (1.4).

`GameScreen` (`src/screens/GameScreen.tsx`) hosts the Phaser canvas plus the HUD, leaderboard, mobile joystick and inventory bar — see [Client — Phaser Game](#client--phaser-game).

### Lobby screen

Built 2026-09-26 (`screens/LobbyScreen.tsx`; rules in [Lobby, characters and teams](#lobby-characters-and-teams)). A full-screen dark page in the results screen's style:
- **Player list:** one row per player in join order — color dot, name ("(disconnected)" if so), team, character, ready state. **Your row has the controls:** a **name field** (edit in place; sent on Enter or leaving the field, Esc cancels; red border and "2–25 characters" hint while invalid; 16px text so iOS Safari doesn't zoom in on focus; `enterKeyHint="done"`, `autoComplete="nickname"`), a **color swatch** (`components/ColorPicker.tsx`, see below), a Character `<select>`, and a **Ready** toggle (yellow "Ready" → green "✓ Ready"; press again to cancel). The swatch and the select are disabled while you're ready. Other rows are read-only ("✓ Ready" / "Not ready"). Below 560px wide each row wraps: name, then the two pickers side by side, then a full-width Ready button.
- **Saved name:** `utils/playerName.ts` keeps the last name you set in `localStorage` (`sector42.playerName`; reads and writes are wrapped, so blocked storage just means no memory) and `GameContext` sends it with every fresh join, so it carries over from game to game and across page loads. The name you *typed* is saved, not the suffixed one, so you don't collect "(1) (1)" over time.
- **Selects are `appearance: none` with a drawn arrow:** Safari ignored the dark styling and drew its own glossy controls (reported 2026-09-26). They're a stopgap — see Planned Features #10.
- **Status line:** "Set your name, pick a team and a character, then press Ready." → "Waiting for N more players to get ready…" once you're ready → a large "Starting in 3…" during the countdown (`usePhaseCountdown` at a 100 ms tick so the first number isn't stale).
- **Your character card:** name, one-line description, and the starting kit (gun, ammo, materials, structures, upgrades) from `CHARACTERS`.
- A short note explains what teammates mean. Notices (disconnect/reconnect toasts) show here too.
- **Bots** (2026-09-28): a bot's row (`BotRow`) shows its name with a **BOT** tag and a ✕ remove button, then a color swatch, Character and **Difficulty** selects that anyone can change. `TeamSelect` (a thin wrapper over `ColorPicker`) and `CharacterSelect` are shared with your own row, so a bot can't take a color someone else has with teams off. Under the list, the **Bots** bar (`AddBot`) has a difficulty select (Medium by default), **+ Add bot**, and a line saying what that difficulty does, or that the game is full at `MAX_PLAYERS`. Bot controls are disabled once the countdown starts. They call `GameContext`'s `addBot` / `removeBot` / `updateBot`, which send the messages. On phones a bot's three selects sit side by side under its name. Bots are always ready, so they never count in "Waiting for N more players". The game list's summary line adds "N bots" (`settingsSummary`).
- `GameContext` exposes `selectTeam`, `selectCharacter` and `setReady` (replacing `startGame`/`endBuying`), and its roster signature now includes team, character, ready, gun, inventory and upgrades. `structureInventory`/`upgrades` are `ArraySchema`s, whose item changes don't fire the player's `onChange`, so the context also subscribes to their `onAdd`/`onRemove`.
- Verified in the browser 2026-09-26 on private ports with two tabs: default teams, switching to a teammate's color (count shows "Red (2)"), picking the Explorer updates the card, both Ready → "Starting in 3…" → the match, with each tab's HUD showing its own kit; the layout at 375px.

### Results screen

Built 2026-09-20 (`screens/ResultsScreen.tsx`). When the match ends the server broadcasts one `gameOver` message with the **final standings** (best first: score, then kills, then tiles — the tie-break order is a placeholder); `App` shows the results screen as soon as it arrives.
- **Content:** a headline ("You win!", "`<name>` wins!", or "Tie: A & B"), a **team table** (team, players, total score — only when some team had two or more players; `utils/results.ts`'s `teamTotals`), a table of rank / player (color dot, "(you)") / score / tiles / structures (count and points, "2 (+250)", from `FinalScore.structurePoints`, which `ScoreSystem.finalScores` sums with the same `structurePoints` lookup the score uses) / kills (shown, but worth 0) with your row highlighted, a footnote stating the scoring (1 per tile + each structure's points; kills don't score; 2026-10-03), the "room closes in Ns" countdown, and **Play again** / **Main menu** buttons.
- **Ties:** players with the same score share a rank, and every rank-1 player is a co-winner. There's no real tie-break yet.
- **Survives the room closing:** the standings live in `GameContext` (`gameOver`, plus `lastSessionId` so "(you)" still works) rather than the room, so the screen stays up after the room closes, switching its note to "This room has closed." Standings come from the server snapshot, so they don't change if someone leaves during the results period. If the snapshot ever didn't arrive, `App` falls back to `scoresFromPlayers(players)` while still connected (structure counts show as 0 in that fallback, and their points are what's left of the score after the tiles).
- **Buttons:** *Play again* → `playAgain()` (leave the old room, clear the results, `connect()` into a fresh lobby); *Main menu* → `exitResults()` (leave and clear, back to the connect screen). `GameContext.leave()` now nulls `roomRef` synchronously and `onLeave` ignores rooms we've already walked away from, so the old room's late close event can't clobber the new connection.
- Verified in the browser 2026-09-20: appears at match end with correct content, counts down, persists after the room closes ("This room has closed."), and *Play again* lands in a new lobby. *Main menu* is implemented but was not exercised.

### URL-based Room Joining (not yet implemented)
- Room created via HTTP `POST /rooms` → server returns `{ roomId, shortCode }`
- Shareable URL: `https://yourgame.com/play/ABC123`
- On page load, client reads room code from URL path and auto-joins that room
- Server validates: room exists, not full, game not already in `playing` or `results` phase

---

## Client — Phaser Game

**Implemented 2026-09-20; lobby → match start → movement/tile-claiming verified in a real browser the same day** (see [Real-browser pass](#real-browser-pass--2026-09-20-first-one); combat, structures, and mobile controls are still unexercised there). Build + typecheck + lint are clean. This deviates from the original sketch in a few ways worth calling out:

- **No `PreloadScene` or `UIScene`.** Every entity (player, projectile, structure, tile) renders as a plain Phaser primitive (`add.circle`/`add.rectangle`/a shared `Graphics` for the tile grid) rather than a sprite, so there's nothing to preload. The HUD and leaderboard are a **React overlay** (`GameScreen`, `HUD.tsx`, `Leaderboard.tsx`), not a Phaser `UIScene` — they're driven by state that's already reactive on the React side (`GameContext`'s `players`/`phase`), so re-implementing that reactivity inside Phaser would be pure duplication. `GameScene` owns only the parts of the screen that need per-frame, direct-state-read rendering: the map, players, projectiles, and structures.
- **A single scene (`GameScene`) does it all** — tile rendering, entity rendering, camera follow, and input — rather than splitting responsibilities the original sketch proposed (`TileRenderer`/`PlayerRenderer`/`ProjectileRenderer`/`StructureRenderer`/`InputHandler` as separate files). Splitting those out is a reasonable follow-up once the scene grows, but wasn't necessary for a working first version.
- **No arcade physics.** Collision is server-authoritative (see [Collision Detection](#collision-detection)); the client only renders positions it's told, so there's no local physics simulation to configure.

### `game/PhaserGame.ts`

```typescript
import Phaser from 'phaser';
import { GameScene, type GameSceneCallbacks } from './scenes/GameScene';
import type { GameRoom } from '../net/GameConnection';

export function createPhaserGame(
  parent: HTMLElement,
  room: GameRoom,
  sessionId: string,
  callbacks: GameSceneCallbacks
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || window.innerWidth,
    height: parent.clientHeight || window.innerHeight,
    backgroundColor: '#1a1a2e',
    scale: { mode: Phaser.Scale.RESIZE },
    // No `scene` entry here — GameScene needs init data (the room/sessionId/
    // callbacks), so it's added and started explicitly below rather than
    // auto-started by the config, which would run init() with no data first.
  });

  game.scene.add('GameScene', GameScene);
  game.scene.start('GameScene', { room, sessionId, callbacks });
  return game;
}
```

### `game/scenes/GameScene.ts` — responsibilities

- **Isometric hex terrain**: two **baked `RenderTexture` layers** plus a small `Graphics` for the hover outline. Both are split into tiles: the claim tints into `CLAIM_CHUNK_SIZE` (512) chunks, and since 2026-09-27 the base into `BASE_TILE_SIZE` (2048) tiles (`baseTiles`), each drawing the same baked `Graphics` shifted to its position. One texture for a Large map (~4,650 × 3,200 px) would pass the 4,096 px limit of some phones' GPUs. (Both big layers were `Graphics` objects at first; a `Graphics` re-runs its entire command list every frame, so the 4,096-hex base cost **~53 ms of JS per frame — under 20 fps** — and made movement look jumpy. Baking dropped that to ~0.75 ms/frame. In Phaser 4 a `RenderTexture` needs `draw(...)` *then* `render()`, which `GameScene.bake` does.) (1) *Base* — every hex drawn once into its texture at scene create: cliff faces on the three lower edges (`HEX_DEPTH` px tall), then the top face and outline, tiles sorted back-to-front by center y so a nearer tile's top covers the face of the tile behind it. It never redraws. (2) *Claims* — the top face of each claimed hex tinted with its owner's color (`CLAIM_BLEND`) **and outlined with a darker shade of that fill** (`CLAIM_BORDER_DARKEN`/`CLAIM_BORDER_WIDTH`; the fill would otherwise paint over the base outline and merge same-colored hexes into a blob). This layer is split into **512×512-px chunk textures** (`CLAIM_CHUNK_SIZE`, 35 chunks, ≤215 hexes each; a hex straddling a chunk edge is drawn into both). `syncClaims()` compares each tile's owner with what was last drawn (`renderedOwners`), and re-bakes only the chunks containing a change (`rebakeChunk`), so the cost of a claim is bounded by one chunk however many hexes are claimed, and off-screen chunks are culled. It runs when a dirty flag is set (by `tilesClaimed`, or a player leaving — their tiles are released without an event), at most once per frame. (3) *Hover* — an outline of the hex under the mouse (a check that pointer picking matches the drawn grid), redrawn only when the hovered hex or build mode changes. Hex corner points are cached per tile (as `Vector2`s, which is what `Graphics.fillPoints` is typed for in Phaser 4). With uniform heights, cliff faces only show on the map edge; per-tile elevation would need the base layer split by height (see Planned Features).
- **Entity lifecycle**: `getStateCallbacks(room)`'s `onAdd`/`onRemove` on `players`/`projectiles`/`structures` create/destroy the corresponding Phaser game object. Existing entities at scene-create time are handled with one explicit `forEach`, since `onAdd` only fires for changes *after* the callback is registered — full state sent on join doesn't retroactively fire it. **These room listeners (and `tilesClaimed`) are detached when the game goes** (2026-09-28): on the scene's `SHUTDOWN`/`DESTROY`, and as soon as `destroyPhaserGame` (`game/PhaserGame.ts`, what `GameScreen` calls) sets `GAME_DISPOSED_KEY` in the game's registry, or never attached if it was set first. Phaser only tears a game down on its next frame, and a game destroyed while still booting (React StrictMode's throwaway first mount in dev) never does. So its scene kept listening to the room and threw `Cannot read properties of null (reading 'add')` for every new shot or structure; bots made that show at once.
- **Entity views and depth**: each entity remembers its smoothed *world* position (`wx`, `wy`); the Phaser object sits at `project(wx, wy)` with `setDepth(projectedY)` so things lower on screen draw in front. A player is a `Container` of a flattened shadow ellipse, a body circle lifted `BODY_LIFT` px off the ground, and a small "nose" dot on the facing direction (your own from local input so it never lags the mouse; others' from the synced `angle`). Projectiles float at body height; structures are boxes raised `STRUCTURE_LIFT`.
- **Smoothing**: `update()` reads `room.state` directly every frame (not through React) and moves each entity's world position toward `serverPosition + velocity × EXTRAPOLATION_S` by `1 − exp(−SMOOTHING_RATE × dt)` — exponential smoothing that's frame-rate independent, unlike the old fixed per-frame lerp. Jumps larger than `SNAP_DISTANCE` (a respawn) teleport instead of gliding across the map. Projectiles use the same chase with their `speed`/`angle` as the extrapolation.
- **Camera**: follows the local player's container (`startFollow`), bounded to the projected map size.
- **Input**: every frame the scene works out a *world-space* direction — from the joystick if active, otherwise from the keyboard (see [Movement](#movement); on-screen WASD by default, mouse-relative optional) — and the current `aimAngle`. `updateAim()` recomputes the aim from the mouse each frame (`pointerToWorld`: camera scroll, then `unproject`) *even if the mouse hasn't moved*, because the camera moves under it; it's skipped for touch pointers. `sendInputIfChanged()` sends at most every `INPUT_SEND_INTERVAL_MS` (50ms), only when direction or angle changed, with a `INPUT_KEEPALIVE_MS` (250ms) resend so the server's stale-input cutoff never fires on an active player.
- **Shooting**: three ways in, one gate. A pointer-down (mouse click or touch tap) is `unproject`ed to a world point and fires toward it, also setting `aimAngle` (on touch there's no mouse, so the tap becomes the aim the fire button uses next). **Space** and the mobile **FIRE** button (`setFireHeld`) fire along the current `aimAngle` — the mouse on desktop, the last movement direction or tapped point on touch — and repeat while held. All three go through `tryShoot`, which enforces the equipped gun's `GUN_FIRE_INTERVAL_MS` (shared; Basic 1000 ms, Big 200 ms since 2026-10-03, when the client-only `FIRE_INTERVAL_MS` of 200 was removed), skips sends outside the match or with no ammo, and otherwise calls `onShoot(angle)`. The cooldown is **client-side only** — the server has no fire-rate limit (see Known Issues). Space is registered as a Phaser key (so the page doesn't scroll); React buttons `blur()` after a click so Space keeps meaning "shoot" rather than "press the focused button".
- **Projectile art (placeholder)**: a `Container` of a small ground shadow, a translucent glow circle and a bright core circle floating at `BODY_LIFT` — no sprite assets yet (see Planned Features #7).
- **Spawn platforms** (`game/spawnPad.ts`, 2026-09-27): each `PlayerView` gets a `pad` Graphics at its synced `Player.spawnTileX/Y` (set in `onJoin` from `spawnHex`), a steel ellipse with a rim and a light in the team color, at depth −0.45 (above the claim tint, under the Harvester ring and every entity); it's destroyed with the player. **Moving it (2026-10-03):** when the synced `GameState.respawnWhereDied` is true (the server's flag, now a synced field), `GameScene.movePadToDeath` puts the pad at the player's position while they are down (`respawnAt > 0`) and once more on the frame they come back (`PlayerView.wasDown`), since the server may have moved them off an unusable hex; it stays there afterwards. With the flag off it never moves.
- **Building**: if `setBuildMode(true)` was called (wired to the React "Build" button in `GameScreen`), the next pointer-down instead places a structure on `pixelToHex(point)` and turns build mode back off — the tap does not also fire.

### Input — desktop and mobile share one message contract

Touch support needed no protocol changes, confirming what [Planned Features](#planned-features) predicted: `input`'s world-space `{x, y}` vector and `shoot`'s `angle` are input-method-agnostic. (The hex/mouse-aim work later added only the optional `angle` on `input`.)

- **Desktop**: mouse-aim + keyboard inside `GameScene`, above.
- **Mobile**: `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built from plain pointer events (no Phaser plugin dependency), rendered as a React overlay by `GameScreen` when `utils/device.ts`'s `isTouchDevice()` returns true. It reports the raw on-screen deflection (each axis clamped to `[-1, 1]`) to the active `GameScene` via `setJoystick()` — reached through `game.scene.getScene('GameScene')` from `GameScreen`, since the joystick is a React component with no direct reference to the Phaser scene. The scene converts it to a world-space direction each frame (undoing the iso squash, keeping the stick's strength as speed). Not yet exercised on a real touch device.

### HUD and Leaderboard — React overlays, not a Phaser UIScene

`HUD.tsx`, `ScoreBadge.tsx`, `Leaderboard.tsx` and the buttons render on top of the Phaser canvas (absolutely positioned `<div>`s in `GameScreen`), reading from `GameContext` — the same reactive `players`/`phase`/`phaseEndsAt` state already used by the lobby screen. This avoids re-deriving Colyseus reactivity a second time inside Phaser.

- **HUD** (top left): phase countdown, health ("140 / 200" — current / max), gun ("none" or its name), ammo, tiles, materials, structures left to build (e.g. "Farm" or "none"), the equipped upgrade with its level (e.g. "Booster 2"), and Armor's level if you have any.
- **Score badge** (top center, always visible): the local player's score. Real scoring doesn't exist yet, so `utils/score.ts`'s `scoreFor()` returns materials; the badge and the leaderboard both go through it, so implementing [Planned Features #3](#planned-features) means changing that one function. Until then the badge and the HUD's Materials line show the same number.
- **Leaderboard** (popup): hidden by default; a top-right **Leaderboard** button (highlighted while open) or the **`L`** key toggles it, and **`Esc`**, the × button or a click on the dimmed backdrop closes it. It's a centered panel over the canvas (rank, color, name, score, tiles, kills, disconnected flag), ranked by `scoreFor`.
- **Build menu** (popup, `components/BuildMenu.tsx`; the Fabricator popup `FabricatorMenu.tsx`, the Shop and `BuyMenu.tsx` before it, are gone as separate popups since 2026-10-03): one **Build** button below the Leaderboard button (during the match) toggles it. It has two tabs, chosen by `GameScreen`'s `menuTab` and `toggleMenu(tab)`: **Structures** (the four structures from `SHOP_ITEMS`: cost, points, health, how many you hold, Place, the Guard Tower limit; never locked) and **Upgrades** (`UpgradesPanel.tsx`: your ammo and gun, then the Weapons and Upgrades categories; items you already have, `ownsShopItem`, show "Owned" or "Max"). The Upgrades tab is disabled (grayed, `title` "Build a Fabricator to unlock this") until `Player.hasFabricator`, and `BuildMenu` shows Structures whenever it is asked for Upgrades without one, so it also falls back by itself if your last fabricator is destroyed. **Hotkeys:** `B` opens Structures, `F` and `U` open Upgrades, each closing the menu if it is already open on that tab; `E` and `P` toggle placement mode. Only one popup (build menu or leaderboard) is open at a time; `Esc` closes either. The header shows materials and `Tiles x / y` on both tabs.
- **Inventory popup — removed 2026-09-27.** `components/Inventory.tsx` (2026-09-26: gun, ammo, structures by type with Select, upgrades with Equip, on an Inventory button or `I`) was replaced by the inventory bar; `I` now hides and shows the bar.
- **Inventory bar** (`components/InventoryBar.tsx`, 2026-09-27; replaced the bottom-right Build button and the Inventory popup): a vertical toolbar on the right under the Leaderboard, Fabricator and Build buttons, during the match; `I` toggles `GameScreen`'s `showInventoryBar`. **Tab in build mode** calls `cycleStructure(inventory, current, ±1)` (`utils/build.ts`: the held types in catalog order, wrapping) and sets `selectedStructure`; the keydown handler `preventDefault`s Tab only while build mode is armed. One `Slot` button per structure type held (count badge, catalog order) and per owned upgrade (level badge when `maxLevel > 1`). A structure click calls `GameScreen.buildFromBar`: disarm if that type is already armed, else `setSelectedStructure(type)` and arm build mode. An upgrade click sends `equipUpgrade`; the equipped one and Armor are disabled display slots, and the others are disabled while `wingsStuck` (the `overSolidTerrain` callback from `GameScreen`, re-checked every 200 ms by `useRerenderEvery`). Icons are SVG (`components/ItemIcon.tsx`) in the pickup colors from `game/constants.ts`. While build mode is armed, `GameScreen` shows a non-interactive yellow hint at the bottom center. Which structure build mode uses is `structureToBuild(inventory, selectedStructure)` (`utils/build.ts`): the type picked in the Inventory while you still have one, else the first in the inventory. The Phaser `onPlaceStructure` callback outlives renders, so it reads the pick from a ref (synced in an effect) and the inventory live from room state. Arming build mode makes the next tap place that structure on one of your tiles (the server uses up that inventory entry). **P** toggles build mode (it was **B** until 2026-10-03, when B became the Build menu), **Esc** leaves it, and there's no timeout; the Build menu's Place button arms it through the same `buildFromBar`. `GameScreen` keeps the scene's build mode in sync with its own state through an effect, so leaving build mode or running out of structures returns taps to shooting.
- **Fire button** (touch only, during the match only, and only once you have a gun): a hold-to-fire button in the bottom-right corner; the build hint sits above it on touch.
- **Viewport fit:** `GameScreen`'s container is `position: fixed; inset: 0`. It used to be `100vw × 100vh` inside the Vite template's `#root` (1126px wide, `min-height: 100svh`, centered text), which made the page scroll and clipped the right-hand overlays, and made the overlay text centered. Panels also set `text-align: left` explicitly.

---

## Room Lifecycle

### Creation

**Games: codes, settings and the list** (2026-09-27). The Create game screen calls `client.create('GameRoom', { name, game: settings })`; `onCreate` gives the room a code as its id (`games.ts` → `uniqueGameCode`: `GAME_CODE_LENGTH` 4 characters from `GAME_CODE_ALPHABET`, which leaves out 0/O and 1/I, retried until `matchMaker.query({ roomId })` finds no room), and applies the settings (`GameState.settings`, synced; `PhaseSystem.matchDurationMs` reads `matchMinutes`; `pickupGrid` scales the pod grid with the map; `areAllies` and `LobbySystem.selectTeam` honor `teams`). Joining by code is `client.joinById(code)`. **Listing:** each room keeps its settings and phase in its matchmaker metadata (`setMetadata`), and `GET /games` (`index.ts` → `listGames` → `listingsFrom(matchMaker.query({ name: 'GameRoom' }))`) returns the unlocked, non-private ones as `GameListing`s with `clients`/`maxClients`, lobbies first then by name. A finished game locks itself, so it drops off the list. A plain `joinOrCreate('GameRoom')` (the e2e harness) still works and creates a default game.

### Valid States

```
CREATED ──► LOBBY ⇄ COUNTDOWN ──► PLAYING ──► RESULTS ──► CLOSED
                         │             │          │
                    (3s timer)   (5 min timer)  (60s timer, room locked)
```

`LOBBY` → `COUNTDOWN` happens when every connected player is ready; `COUNTDOWN` → `LOBBY` if that stops being true before the 3s are up (see `LobbySystem`).

### Closing a finished room

Implemented 2026-09-20 in `GameRoom.closeFinishedMatch` and `onLeave`:
- When the phase becomes `results`, the room is **locked** so `joinOrCreate` puts newcomers in a fresh lobby instead of a finished match.
- The room is closed with `disconnect()` when `phase.endsAt` passes (`RESULTS_DURATION_MS`, 60s).
- In `results` a departing player is cleaned up immediately with **no reconnect window** (`onLeave` treats it like a consented leave), so the room empties and Colyseus's default `autoDispose` closes it as soon as the last player is gone — even if the results timer is still running.
- **Why 60s:** there's no formal industry standard; typical practice is somewhere between a few seconds and a couple of minutes — long enough to look at results, short enough not to hold server resources. With no results screen or rematch flow yet, a minute is plenty; 2–3 minutes is easy to choose instead (one constant).
- **Client behavior:** the server closes the room with Colyseus's `CONSENTED` code (4000). The client's `isNormalClose` treats both 1000 and 4000 as deliberate, so it returns to the connect screen instead of entering its reconnect loop (which would silently drop the player into a new lobby).
- Verified 2026-09-20 with a scaled-time headless run (locked while finished → newcomer gets a different lobby room; closed 49ms after the timer; closes immediately when both players leave with the timer still running) and in the browser (Results countdown → connect screen).

### Destruction Triggers
| Trigger | Action |
|---|---|
| `results` phase timer expires | Room closed (`disconnect()`), ✅ implemented |
| Last player leaves during `results` | Room closes immediately, ✅ implemented |
| All players leave (lobby/other phases) | Colyseus `autoDispose` closes it once no clients remain and no reconnect window is pending |
| A player disconnects abruptly before `results` | Their seat is held for the 3-minute reconnect window, then released |
| Idle lobby (no activity for 10 min) | Not implemented (see Cleanup Sweep) |

### Cleanup Sweep
A periodic sweep every 60 seconds checks all rooms via `gameServer.presence` and disposes any that are empty or have been idle past their threshold. **Not yet implemented** — currently rooms only dispose via Colyseus's default empty-room behavior.

---

## Reconnection System

### Flow

```
Player disconnects
       │
       ▼
Server: onLeave(client, consented=false) fires — mark player.connected = false
Server: this.allowReconnection(client, 180) — opens a 180s reconnection window (awaited in a try/catch)
Other clients: see the frozen entity via the Player.connected field's delta sync
       │
  ┌────▼────┐                    ┌────────────────┐
  │ < 3 min │                    │   >= 3 min     │
  └────┬────┘                    └───────┬────────┘
       │                                 │
Player reconnects                  allowReconnection's promise rejects
Client presents reconnectionToken  Server: release player's tiles, delete player,
player.connected = true again      (cleanupPlayer)
```

> Implementation note (Colyseus 0.16.5): there is a single `onLeave(client, consented)` hook, not the split `onDrop`/`onReconnect`/`onLeave` hooks a newer Colyseus line uses. `allowReconnection` is awaited directly inside `onLeave` when `!consented`: the `await` resolves if the client reconnects in time (Colyseus swaps the underlying connection back onto the same `Client`/session transparently — there's no separate `onReconnect` hook to mark `connected = true` in, so `GameRoom.onLeave` does it itself right after the `await` succeeds) and rejects once the window expires, which the `catch` block treats as the final departure. See the `GameRoom.ts` code under [Server — Colyseus](#server--colyseus). The `playerDisconnected`/`playerReconnected` broadcast events from the original design are **not implemented** — clients currently learn about connection state only via the `Player.connected` field's delta sync. On the client side, `GameConnection.ts`'s reconnection support (via `client.reconnect(token)`) is implemented and used automatically by `GameContext`'s retry loop on an unexpected drop — see [Client — React Shell](#client--react-shell).

### Reconnection Token
- Issued by Colyseus automatically on initial join (`room.reconnectionToken`)
- Client stores it in `sessionStorage` (persists across page refreshes in the same tab, cleared on tab close) — see `saveReconnectionToken`/`readReconnectionToken` in `client/src/net/GameConnection.ts`
- Presented automatically via `client.reconnect(token)`, tried first on every `connectToGame()` call if a token is stored; falls back to a fresh `joinOrCreate` if the token is rejected (expired, room gone, server restarted)

### Notifications, retry, and visible-tab reconnect (2026-09-20)

- **Everyone is told.** When a player's connection drops (not a deliberate leave, and not during `results`), the server broadcasts `playerDisconnected { playerId, name, reconnectWindowMs }` to everyone; when they get back in within the window it broadcasts `playerReconnected { playerId, name }` to everyone *except the returning player* (excluded by session id, because `onLeave`'s `client` is the old closed connection — an earlier `except: client` still delivered it to the returning player). The client shows short toasts via `NoticeStack` (top center under the score badge, auto-dismissed after 6 s, at most 4): amber "`<name>` disconnected — their spot is held for 3 min" and green "`<name>` reconnected". The client also ignores a reconnect event whose id is its own. Verified with three headless clients (both other players received both events; the returning player none) and in the browser (both toasts appear and fade).
- **Retry until the window closes.** After an unexpected drop the client retries every 1.5 s for up to `MAX_RECONNECT_ATTEMPTS` (120, ≈ the server's 3-minute window); a *failed* attempt no longer ends in the error screen while it's still inside that cycle. A first-time connect failure still shows the error as before.
- **Reconnect the moment the tab is visible.** A hidden tab has its timers throttled or is frozen, so a dropped connection could sit waiting on a slow retry timer. `GameContext` listens for `visibilitychange` (and `online`): if a reconnect cycle is pending and the tab is visible, it cancels the timer and reconnects immediately. Measured with a simulated visibility change: back in the game in 332 ms when the tab became visible at ~300 ms, vs 1.8 s with the timer alone. (The test pane never reports itself visible, so `document.visibilityState` was overridden in the page to simulate it; a real background tab wasn't exercised.)
- Not covered: a reconnect after the 3-minute window has expired falls through `connectToGame`'s fallback and joins a brand-new room as a new player, as before.

### Disconnect Behavior During Game
- Player entity remains on the map (frozen — no movement, no shooting; `MovementSystem`/`CombatSystem` both skip disconnected players). **Other clients keep drawing it, dimmed** (`DISCONNECTED_ALPHA` 0.4, including the Harvester ring) — it used to be hidden entirely, which made a dropped player look like it had vanished while its hexes stayed (reported 2026-09-20: a blue player in Chrome missing from Safari's view)
- Frozen players are still valid targets (shooting them continues — `CombatSystem` doesn't check `connected` before applying hits)
- Their owned tiles are retained during the reconnect window
- Structures they placed remain active
- In the lobby, a disconnected player is left out of the ready check, so they don't block the countdown

---

## Collision Detection

**All collision detection runs server-side.** Client does no authoritative collision resolution.

### Projectile vs Player (swept circle-circle)
The test uses the path the projectile travelled this tick (`prev` → `proj`), not just its end point. Shots move 20–33 world px per tick and the combined hit radius is only 26 px (`PLAYER_RADIUS` 20 + `PROJECTILE_RADIUS` 6; it was 22 px when the player radius was 16), so an end-point-only check lets grazing shots skip over a player — measured with a Monte Carlo script on 2026-09-20, hit rate at the edge of the hitbox fell to 56–75% for vertical shots (33 px steps) vs 92% sideways before the fix, and is 100% in both directions after it. Omit `prev` to test a single point.
```typescript
// CollisionSystem.ts
function checkProjectilePlayerCollision(
  proj: { x: number; y: number },
  player: { x: number; y: number },
  prev: { x: number; y: number } = proj
): boolean {
  const segX = proj.x - prev.x;
  const segY = proj.y - prev.y;
  const segLengthSq = segX * segX + segY * segY;

  // Closest point on the segment to the player's center.
  let t = 0;
  if (segLengthSq > 0) {
    t = ((player.x - prev.x) * segX + (player.y - prev.y) * segY) / segLengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const dx = prev.x + segX * t - player.x;
  const dy = prev.y + segY * t - player.y;
  return Math.sqrt(dx * dx + dy * dy) < PROJECTILE_RADIUS + PLAYER_RADIUS;
}
```

### Projectile vs Structure (hexagon containment)
A projectile hits a structure when it's inside the structure's 7-hex hexagon (see [Structures: footprint and shape](#structures-footprint-and-shape); it was single-hex containment before 2026-09-26, and an AABB before the map became hexes). It's an end-point test: the hexagon is ~150 px across and shots move ≤ 33 px per tick, so only a shot clipping a corner can be missed.
```typescript
function checkProjectileStructureCollision(
  proj: { x: number; y: number },
  structure: { tileX: number; tileY: number }
): boolean {
  return structureContact(proj.x, proj.y, structure.tileX, structure.tileY).distance <= 0;
}
```

### Tile Claiming (Hex grid)
Player position → `pixelToHex` → check the hex is on the map and who owns it; every claim this tick is collected into one batched `tilesClaimed` broadcast:
```typescript
function claimTile(state: GameState, player: Player, claimed: TilesClaimedEvent['tiles']) {
  const { col: tileX, row: tileY } = pixelToHex(player.x, player.y);
  // Map corners/edges aren't fully covered by hexes, so a player can be over no tile at all.
  if (!isValidHex(tileX, tileY, state.mapWidth, state.mapHeight)) return;
  const tile = state.tiles[hexIndex(tileX, tileY, state.mapWidth)];
  if (!tile || tile.ownerId === player.id) return;

  if (tile.ownerId !== '') {
    state.players.get(tile.ownerId)!.tilesOwned--;
  }
  tile.ownerId = player.id;
  player.tilesOwned++;
  claimed.push({ x: tileX, y: tileY, ownerId: player.id });
}
```

### Spatial Optimization
At the expected entity count (≤10 players, ~30 projectiles, ~50 structures), a brute-force O(n²) check is acceptable — this is what's implemented (nested `forEach` over players/structures per projectile per tick). If entity counts grow significantly, introduce a simple grid spatial hash:
- Divide map into cells equal to the largest collision radius × 2
- Bucket entities by cell
- Check only entities in the same or adjacent cells per projectile

---

## Destructible Structures

### Health-Based Discrete Destruction (chosen approach)
Structures have a `health` field. Projectile hits reduce health by `damage`. At 0, structure is removed from state and a `structureDestroyed` event is broadcast.

| Damage Threshold | Visual State |
|---|---|
| 100–67% health | Intact |
| 66–34% health | Cracked (visual overlay) |
| 33–1% health | Heavily damaged (different sprite/tint) |
| 0 health | Destroyed, removed from state |

The visual-state thresholds are a client-side rendering concern — not implemented yet, since there's no client renderer.

### Server Logic (implemented, `StructureSystem.ts`)
```typescript
function applyDamage(state: GameState, structureId: string, damage: number, broadcast?: Broadcast) {
  const structure = state.structures.get(structureId);
  if (!structure) return;

  structure.health -= damage;
  if (structure.health <= 0) {
    state.structures.delete(structureId);
    broadcast?.('structureDestroyed', { structureId });
  }
}
```

### Client Rendering
```typescript
// StructureRenderer.ts — not yet implemented
function getStructureFrame(health: number, maxHealth: number): string {
  const pct = health / maxHealth;
  if (pct > 0.66) return 'structure-intact';
  if (pct > 0.33) return 'structure-cracked';
  return 'structure-damaged';
}
```

---

## Testing Multiplayer Locally

### Server unit tests (Vitest) — added 2026-09-26

`cd server && npm test` (or `npm run test:watch`) runs **Vitest** on specs next to the code (`src/systems/ShopSystem.ts` → `ShopSystem.spec.ts`): 349 tests in 7–17 s, depending on how busy the machine is. They replaced `tools/check-rules.js` and `tools/check-collisions.js`, covering everything those did plus more.
- **Config:** `server/vitest.config.ts`. `testTimeout` is 20 s (since 2026-09-28): the sweeping specs (792 structure approaches, 40 generated maps, terrain corners) take 4–5 s each, and on a busy machine they passed Vitest's 5 s default. Vitest transpiles with `tsconfig.json`'s settings, including the decorator options the Colyseus schema needs; `src/state/GameState.spec.ts` round-trips state through the Colyseus encoder (full sync, then a delta), which **fails if `useDefineForClassFields` is ever flipped** — verified by flipping it.
- **Builds stay clean:** `tsconfig.json` type-checks everything including specs (`npm run typecheck`, and your editor); `tsconfig.build.json` (used by `npm run build`) excludes `**/*.spec.ts` and `src/test/`, so `dist/` holds only the server.
- **Helpers:** `src/test/world.ts` — `world()` (a 64 × 64 map; `{ tiles: false }` skips the 4,096 tiles for movement/combat loops that build hundreds of worlds), `addPlayer`/`addPlayerAt`, `addStructure(state, owner, col, row, type = 'farm', rotation = 0)`, `ownFootprint(…, type, rotation)`, `addShot`/`shootAt`, `inputs`/`runMovement`/`drive`, `onScreenSpeed`.
- **Covered:** hex math and the structure hexagon/`structureContact` (`hex.spec.ts`); the spawn line and slot assignment (`terrain.spec.ts`); the schema (`state/GameState.spec.ts`); `teams.spec.ts`; and every system — movement (speeds, stale input, edges, boost, structures incl. the 792-approach slide sweep), lobby (ready-up, countdown and its cancelling, picks and locks, default teams, names), phases, characters, combat (damage, kills, respawn at your spawn slot, ion cannon vs armor, friendly fire, structure damage, projectile speed, the no-tunneling check), claiming (brute-force radius check, stealing, teammates, footprint protection, batching), score, economy, shop (every item and rule), structure placement and damage; bots (`BotSystem.spec.ts` and `src/bots/*.spec.ts`, see Game Mechanics → *Bots*).
- **Not covered here:** `GameRoom` (message handlers, joining, reconnection, closing) — that's what `tools/e2e.js` exercises with real clients over a real server. When writing e2e checks, wait for the *state* rather than a message plus a fixed sleep: broadcasts go out immediately but state changes ride the next 50 ms patch (the cause of a ~1-in-10 flake in the disconnect check, fixed 2026-09-26; `E2E_PORT` lets several runs go in parallel to shake such races out — see `tools/README.md`). The pure `shared/` rules (name cleanup, `ownsShopItem`, catalog sanity) are tested once, in the client suite.

### Client unit tests (Vitest) — added 2026-09-26

`cd client && npm test` (or `npm run test:watch`) runs **Vitest** with **jsdom** (a simulated browser) and **React Testing Library**. Configuration is the `test` block in `client/vite.config.ts`; `src/test/setup.ts` adds the jest-dom matchers and cleans up (unmount, clear `localStorage`) after every test; `src/test/factories.ts` has `makePlayer` / `makeScore` builders.
- **Spec files sit next to what they test** (`foo.ts` → `foo.spec.ts`, `Foo.tsx` → `Foo.spec.tsx`) and are type-checked and linted with the rest of `src/` (they're never bundled).
- **Covered (239 tests):** the start screens (`SplashScreen`, `JoiningScreen`, `GamesScreen`: list, full games, filter, typed code, empty and offline; `CreateGameScreen`: defaults, option order, choices, the Teams / Drop pods / Guns switches and their [?] tooltips, busy, error), `utils/route` (paths, codes), `utils/games` (filter, summary), `normalizeGameSettings`, the lobby's settings line and teams-off layout and Leave, `InventoryBar` (icons, counts and levels, build/stop, switching, the Jetpack lock), `utils/build` (which structure Build places, and Tab's cycling), `utils/results` (ranks, ties, fallback ordering, team totals), `utils/playerName` (localStorage, including blocked storage), `utils/usePhaseCountdown` (fake timers), `game/hex` (projection), `types/shared` (name rules, `ownsShopItem`, catalog sanity — the client's view of `shared/`), and components: `WeaponIcon` (the three weapons: distinct, in the icon box, the Ion Cannon's yellow bolt), `UpgradesPanel` (a 36 px picture on every row, none for weapons the game doesn't offer), `StructureIcon` (a picture per type, the pad of 7 or 3 hexes in the player's color and inside the icon box, a neutral pad without one, kept size in a flex row, unique clip path ids), `InventoryBar` and `BuildMenu` passing the player's color, `game/structures` (the drawing kit's projection, visibility and lighting; each type's art for determinism, fitting its texture, standing on the origin, using the team color and differing from the others; the dome's tiling; baking once; smoke sources; `SmokeEmitter` with a fake scene), `ColorPicker` (closed swatch, the popup's title and ten swatches, picking, Esc and click-away, arrow keys skipping taken colors, taken and count states, disabled and closing when disabled, the touch-size CSS), `HUD` (Gun and Ammo only in a game with guns), `BuyMenu` (grouping, affordability, Owned/Max, next upgrade level, buying, closing), `LobbyScreen` (name editing: Enter/blur/Esc/invalid; team/character/ready and the ready lock; other players' rows; bots: adding by difficulty, changing and removing them, a taken color, the countdown lock and a full game; waiting and countdown text — with `useGameConnection` replaced by a fake via `vi.mock`), `ResultsScreen` (headlines, ties, team table, buttons).
- **Not covered:** `GameScene` and anything else Phaser draws (needs a real WebGL canvas — still checked by hand in a browser), `GameContext`/`GameConnection` (would need a fake Colyseus room), `GameScreen`'s key handling.
- Tests query the UI the way a user would (roles and accessible names), which is why each shop row is a `role="group"` named after its item.

> **Where these checks live now:** the rule and collision checks became **server Vitest specs** on 2026-09-26 (see *Server unit tests* above), and `tools/check-rules.js` / `tools/check-collisions.js` were removed; notes elsewhere in this doc that cite those scripts refer to the specs now. `tools/` keeps `e2e.js` and `bots.js`. History: these checks started as throwaway scripts run from temporary folders, were lost, and were rebuilt in `tools/` on 2026-09-25. The notes below describe what each verification covered when it was first done; where they mention numbers for older constants (player radius 16, claim radius 64), the tests now read the live constants instead.

### Direct System Tests (no client/network required)

Because `MovementSystem`, `CollisionSystem`, `CombatSystem`, `StructureSystem`, and `PhaseSystem` are plain modules operating on a `GameState` instance (not `Room` subclasses), they can be exercised directly without spinning up a server or client — this is how the game logic was verified while the client/server version mismatch (see [Tech Stack](#tech-stack)) was still unresolved, and remains useful for fast, network-free regression checks.

**Verified 2026-09-19** with a throwaway script run via `npx ts-node --transpile-only`, covering:
- Movement applies input and clamps to map bounds
- Tile claiming under a moving player, batched into one `tilesClaimed` broadcast, no re-broadcast for already-owned tiles
- Projectile-vs-player hit reduces health, broadcasts `playerHit`, and on a killing blow credits the shooter's `kills` and respawns the target at full health
- Projectile-vs-structure hit destroys the structure at 0 health and broadcasts `structureDestroyed`
- Projectiles expire by age (`spawnedAt` + the shot's `lifetimeMs`) even without a collision
- `PhaseSystem` advances phases once `endsAt` passes and broadcasts `phaseChanged`; `lobby` never auto-advances

This kind of test is worth keeping as the codebase grows — consider promoting it from a scratch script into a real test file (e.g. with `node:test` or `vitest`) once a test runner is added to the server's dependencies.

### Live Client/Server Smoke Test — verified 2026-09-19

With the version mismatch resolved (see [Tech Stack](#tech-stack)), a real `colyseus.js` client was run against a real running server (both processes, no mocking) and confirmed:
- Join succeeds and `room.sessionId` is assigned
- Full initial state decodes correctly: top-level primitives (`mapWidth`/`mapHeight`), the flat `ArraySchema<Tile>` (all 4096 entries), a nested `Schema` instance (`phase`), and `MapSchema<Player>` containing the joining client's own player with correct defaults
- `getStateCallbacks(room)`'s reactive `onChange` proxy fires for a state change (tested via the `lobby` → `claiming` phase transition — since merged into `playing`)
- `startGame` message advances the phase server-side and the client observes it
- `input` message is processed, movement applies, and the per-client `inputAck` message is received with the matching `seq`
- `tilesClaimed` broadcasts arrive during the match (then the `claiming` phase) and `Player.tilesOwned` increments accordingly

This was a throwaway script (not checked into the client), but the same coverage should be re-run as a real test (or extended into one) any time either side's Colyseus/schema version changes, given how easy it is for a client/server pairing to silently break (see the two Tech Stack incidents this session).

### Real-browser pass — 2026-09-20 (first one)

> The three browser passes below predate the phase merge and use the old `claiming`/`combat` names; they're kept as a record of what was verified at the time.

Until this date the Phaser view had only been verified by typecheck/lint/headless scripts. Driving the Vite dev server (`vite`, port 5173 by default) against the live server in a browser confirmed:
- Lobby lists the joined player ("Player 1 (you)"); **Start Game** moves to `claiming` and the phase countdown ticks down.
- `GameScreen` renders: tile grid, the local player's circle centered on screen, HUD (phase/health/ammo/tiles/materials) top-left, leaderboard top-right.
- Keyboard movement claims tiles: `tilesOwned` went 1 → 28 during a short run, tiles are drawn in the player's color, and `materials` incremented on the 10s payout (the payout was replaced by per-claim income on 2026-09-26).

Not yet exercised in a browser: combat phase, shooting, structure placement/destruction, the mobile joystick and Build button, reconnection after a dropped socket or refresh, multiple simultaneous players, the `results`/game-over screen.

Debugging tips learned the hard way: (1) a blank page means check the browser console first — it was an uncaught provider error, not a build problem; (2) a page stuck on "connecting" with a successful `POST /matchmake/joinOrCreate/GameRoom` (200) in the network tab means the server failed while sending state — read the **server** log; (3) `EADDRINUSE` on 2567 means another server instance (often a `ts-node-dev` you forgot about) is already running; `ts-node-dev --respawn` also restarts itself on any file change, including `tsconfig.json`, so the port can briefly go down mid-session.

**Second pass — hex/isometric prototype (2026-09-20).** Confirmed: hex terrain renders as squashed flat-top hexes with the player's claimed hexes tinted in their color; the hover outline sits exactly on the hex under the cursor; holding `W` with the cursor to the lower right moved the player diagonally toward it, claiming a stepped line of hexes (9 tiles after ~2s of movement); a click in combat spent one ammo. The pass was cut short — the user was using the same dev server at the same time, which put both of us in one room — so structure placement, projectile visuals and the stale-input fix were not re-checked in the browser.

Testing notes from this pass: (1) synthetic key *taps* from browser automation are too short for a per-frame poll to see — dispatch `keydown`, wait, then `keyup` on `window` to simulate a held key; (2) an automation-driven pane can be backgrounded, which pauses Phaser's loop and stops input being sent — that is how the stale-input bug surfaced (the player kept walking after the key was released); (3) if you need a private room for testing while someone else uses the dev server, run a second server on another port (`PORT=2599 node dist/index.js`) and point a second Vite at it with `VITE_SERVER_URL=ws://localhost:2599`.

**Third pass — combat controls and UI (2026-09-20).** Run against a private server/Vite on other ports (`PORT=2599`, `VITE_SERVER_URL=ws://localhost:2599`) so it didn't touch anyone's dev room. Confirmed on desktop: no page scrollbars (document scroll size equals the viewport); score badge top-center and updating; the Leaderboard button fully visible; the popup opens/closes via the button, `L` and `Esc`; claimed hexes each keep their own border; **Space** fires (a 350ms hold spent 2 ammo, matching the 200ms interval); a **click** fires (ammo −1); a projectile renders as the glowing bolt along the aimed direction (its container holds shadow + glow + core). Confirmed in a touch-emulated 375×812 pane: HUD, score badge and Leaderboard button fit on one row; the FIRE button appears in combat with Build stacked above it and the joystick bottom-left; a held FIRE press spends ammo and releases cleanly; a Build tap places a structure on the tapped owned hex without also shooting.

**Performance check (2026-09-20).** Phaser is left at its defaults (WebGL, target 60 fps, one frame per display refresh — no fps cap in `PhaserGame.ts`). Per-frame JS cost is measurable even when the pane's rAF is throttled: listen to the game's `'prestep'` and `'postrender'` events and diff `performance.now()`; toggle a layer's visibility to attribute cost. This found the terrain-`Graphics` problem above. Press the backtick key in game for an on-screen FPS readout (`DebugStats.tsx`); green ≥ 50, yellow ≥ 30, red below.

Testing tips from this pass, for the browser pane used here: (1) the pane can be **hidden or throttled** — it renders only ~3 fps, so `requestAnimationFrame`/Phaser-driven behavior (held-key firing rates, smoothing) reads low and screenshots can lag tens of seconds behind actions; timers longer than ~45s in one script call time out, so wait in ≤10s steps; (2) to catch a short-lived thing like a projectile in a screenshot, grab the Phaser game (React fiber of the canvas's parent → the `gameRef` hook value), wait for the scene state you want, then call `game.loop.sleep()` to freeze the frame before screenshotting (`game.loop.wake()` to resume); (3) a reload rejoins whatever room is alive — including one in `results` (see Known Issues) — so restart the private server for a clean lobby; (4) emulating a phone with the pane's mobile preset sets touch points, so `isTouchDevice()` turns on the joystick and fire button after a reload.

### Performance pass — 2026-09-20

Prompted by a report of ~19 fps and choppy play with two browsers open on the developer's machine. **Not reproduced** — in the test pane (WebGL, ~50–60 fps, DPR 2) the game held 60 fps — so the findings below are about scaling problems that were measurable, not a confirmed explanation of that report. Method: a headless bot script (`colyseus.js`, 4 bots wandering and claiming) joined a match while a real browser client was profiled by timing Phaser's `'prestep'`→`'postrender'` per frame, wrapping the claims code, and counting React provider renders with temporary counters (since removed).

| Measurement (5 players) | Before | After |
|---|---|---|
| Claim re-bake cost | 7.7 ms per claim at 442 claimed hexes (~64 ms/s), **growing with every claimed hex** — projected ~20 ms per claim at ~1,100 hexes | 2.3 ms per claim, **flat** (2.3 ms at 288 hexes and at 1,141 hexes) |
| Phaser JS per frame (avg / p95) | 3.06 / 10.7 ms | 1.3–1.8 / 2.6–4.5 ms |
| React `setPlayers` calls per second | 14.9 | 3.2 |
| React provider re-renders per second (dev build, StrictMode doubles them) | 29.8 | 6.4 |

What changed:
- **Chunked claims layer** (above): re-bake cost is bounded instead of growing with the number of claimed hexes.
- **React roster updates deduplicated:** `GameContext` published a new `players` array on *every* Colyseus `onChange`, i.e. on every server tick for every moving player (x, y, vx, vy, angle), re-rendering the whole tree ~20–30×/s. It now builds a signature of only the fields the UI shows (id, name, color, health, ammo, tiles, kills, score, materials, connected) and skips the update when unchanged. The `Player` objects are live, so components that do re-render read current values.
- **Hover outline** redraws only when the hovered hex changes (it was cleared and redrawn every frame).
- **`powerPreference: 'high-performance'`** in the Phaser render config: on laptops with two GPUs browsers default to the integrated one. Verified it lands in `game.config`.
- **Performance readout** (backtick): now shows fps, average JS ms per frame, renderer, canvas size and pixel ratio. **If fps is low but ms/frame is small, the bottleneck is the GPU or the rest of the browser, not our code** — that is the number to report back if the slowness persists.

Not the cause, as measured: the canvas is at CSS resolution (not scaled by devicePixelRatio), the display list has ~9 objects, and terrain is two 27 MB textures drawn as a handful of quads. Things that could still explain a slow machine and are **untested here**: no hardware WebGL (software rendering), two visible browsers sharing one GPU, a running dev-tools/profiler, and React's dev build.

### Multiple Browser Instances
- Open the game in multiple browser windows or profiles
- Chrome regular window + Chrome Incognito = 2 isolated sessions
- Different browsers (Chrome + Firefox) = even better isolation

### Automated Bot Clients
Write headless Node.js WebSocket clients that simulate players:
```typescript
// bots/bot.ts
import { Client } from 'colyseus.js';

async function runBot(roomId: string) {
  const client = new Client('ws://localhost:2567');
  const room = await client.joinById(roomId);

  setInterval(() => {
    room.send('input', {
      dir: { x: Math.random() > 0.5 ? 1 : -1, y: 0 },
      seq: Date.now()
    });
  }, 50);
}
```
**Built:** `tools/bots.js` (`node tools/bots.js [count] [seconds] [url]`) joins wandering bots to a running match; it was used for the performance pass. (These are load-testing *clients*, not the in-game bots: those run inside the server — see Game Mechanics → *Bots* and `tools/bot-sim.js`.) The stress-testing and fuzzing ideas below are still open. Bots are the most valuable local test tool now that client/server compatibility is confirmed (see the Live Client/Server Smoke Test above) — spin up 10 to stress-test tick performance, fuzz-test edge cases (concurrent tile claims, rapid connect/disconnect), and reproduce race conditions deterministically. Not yet built.

### Network Condition Simulation
- **Chrome DevTools** → Network tab → throttle individual tabs (100–300ms latency)
- **`clumsy`** (Windows) / **`tc qdisc`** (Linux) — OS-level latency, jitter, packet loss
- Test client-side prediction and reconciliation — bugs are invisible at 0ms latency

### Specific Scenarios to Test
| Scenario | What to verify |
|---|---|
| Two players claim same tile same tick | Currently resolved by player-map iteration order (join order), not input `seq` as originally planned — verify this is acceptable or revisit |
| Player disconnects mid-match | Entity freezes, 3-min timer starts, tile ownership retained |
| Player reconnects within 3 min | Control restored, state consistent with what server held |
| Player reconnects after 3 min | Player gone, tiles released, clean state |
| Phase timer expires | Phase transitions correctly on all connected clients |
| Room with 0 active players | Room disposed cleanly, no memory leak |
| Full room (10 players) | 11th join rejected with clear error |
| Server kill mid-match | Clients handle dropped WS connection, show reconnecting UI |
| Player drops in the lobby | Left out of the ready check, so the others' countdown starts without them (`tools/e2e.js`, 2026-09-26). The earlier host-handover row is gone with the host role |
| Browser tab backgrounded/hidden mid-move | Player coasts to a stop within ~1s (stale-input cutoff) instead of running on |
| Player runs out of ammo | Shots are rejected server-side; no regen yet, so this is currently permanent for the rest of the match |

---

## Build Tooling

### Setup Commands

> **Use Node 24** (`nvm use 24`; an `.nvmrc`/`"engines"` field is not set up yet). The repo was developed against v24.21.0.

```bash
# Client
cd client
npm create vite@latest . -- --template react-ts
npm install phaser colyseus.js
npm install --save-dev eslint @eslint/js typescript-eslint globals \
  eslint-plugin-react-hooks eslint-plugin-react-refresh \
  prettier eslint-config-prettier

# Server
cd server
npm init -y
npm install --save-exact colyseus@0.16.5 @colyseus/core@0.16.26 @colyseus/schema@3.0.76 @colyseus/ws-transport@0.16.5
npm install express cors
npm install --save-dev typescript@~6.0.2 @types/node @types/express @types/cors ts-node-dev \
  eslint @eslint/js typescript-eslint globals \
  prettier eslint-config-prettier
```

> `typescript-eslint` currently requires TypeScript `<6.1.0` as a peer dependency — pin `typescript@~6.0.2` explicitly on both client and server if `npm install` resolves a newer TypeScript 7.x and the peer-dependency install fails.
>
> **Pin all four Colyseus packages (`colyseus`, `@colyseus/core`, `@colyseus/schema`, `@colyseus/ws-transport`) to exact versions** — no `^`. `npm install colyseus` unpinned resolves to a newer line, e.g. 0.18, that has no published compatible `colyseus.js` client, and `@colyseus/core` is only a peer dependency, so nothing else constrains it (see the Tech Stack compatibility note, items 1 and 3). `npm install colyseus.js` on the client resolves to `0.16.22`, which is the verified-compatible pairing for these server versions.

### Client `package.json` Scripts
```json
{
  "scripts": {
    "dev":          "vite",
    "build":        "tsc -b && vite build",
    "preview":      "vite preview",
    "lint":         "eslint .",
    "lint:fix":     "eslint . --fix",
    "format":       "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### Server `package.json` Scripts
```json
{
  "scripts": {
    "dev":          "ts-node-dev --respawn --transpile-only src/index.ts",
    "build":        "tsc",
    "start":        "node dist/server/src/index.js",
    "lint":         "eslint . && npm run lint:shared",
    "lint:shared":  "cd ../shared && ../server/node_modules/.bin/eslint .",
    "lint:fix":     "eslint . --fix && cd ../shared && ../server/node_modules/.bin/eslint . --fix",
    "format":       "prettier --write . ../shared",
    "format:check": "prettier --check . ../shared"
  }
}
```

### ESLint — flat config (ESLint 10), both client and server

ESLint 10 uses flat config (`eslint.config.js` / `.mjs`), not the legacy `.eslintrc.json` format. Server config needs the `.mjs` extension when `package.json` sets `"type": "commonjs"` (or no `type`), since the config file itself uses `import` syntax.

**`server/eslint.config.mjs`** (Node globals, no React):
```javascript
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  prettier // disables rules that conflict with Prettier — keep LAST
);
```

**`client/eslint.config.js`** (browser globals + React hooks/refresh):
```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettier
);
```

### `.prettierrc.json` (client, server and shared, identical)

> **Indentation is 4 spaces** (`tabWidth: 4`) — this is the project standard for all new and edited code (earlier drafts of this doc said 2). Files written before that was settled are still 2-space, which is why `npm run format:check` flags them; run `npm run format` in each of `client/` and `server/` to bring everything in line, ideally as its own commit so the whitespace churn doesn't bury real changes. `CLAUDE.md` records the convention for Claude Code sessions.
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 4
}
```

### `tsconfig.json` — server-specific settings

The server's `tsconfig.json` needs a few settings beyond the client's, driven by `@colyseus/schema`'s decorator-based API and Node's module system:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- `experimentalDecorators` + `emitDecoratorMetadata` — required for `@colyseus/schema`'s `@type(...)` decorators; without them, TypeScript reports `TS1240`.
- **`useDefineForClassFields: false` — required, and easy to miss.** At `target: "ES2022"`, TypeScript defaults this to `true`, which compiles a class field initializer like `id: string = '';` into an `Object.defineProperty` call inside the constructor. That silently overwrites the getter/setter `@type()` installs on the prototype for change tracking — no compile error, just a runtime crash the first time a client joins and the server tries to encode full state (`Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')`, thrown deep inside `@colyseus/schema`'s encoder). See the note under [Server — Colyseus](#server--colyseus) for the full incident.
- `module`/`moduleResolution: "NodeNext"` — the older `"module": "commonjs"` + `"moduleResolution": "node"` pairing now emits a `TS5107` deprecation error under TypeScript 6+.

---

## Current Status & Known Issues

_As of 2026-09-26 (after terrain, upgrade levels and the inventory)._ Server and client both typecheck and lint clean, and the game runs end to end in a browser: join → lobby (team, character, ready) → 3 s countdown → mouse-aimed movement on an isometric hex map → tile claiming → materials → shooting (once armed) → building from your inventory → upgrades (buy levels, equip one in the Inventory) → results.

### Working (browser- or script-verified)
- **Respawn delay and backpacks** (2026-09-29: `RespawnSystem.spec.ts` and related specs, `e2e.js`, and the browser on private ports with a scripted shooter): defeated → hidden, with the countdown overlay → the backpack on the hex where you fell (drawn only for its owner) → respawn after 5 s → walking onto it restores the gear, with a notice. Not yet: how the harsher death feels in real play (see GAME_DESIGN's decisions log for its effect on bots).
- **Bots** (2026-09-28: `BotSystem.spec.ts` and the `bots/` specs, `e2e.js` → *Bots*, `tools/bot-sim.js`, and the browser on private ports): adding Easy/Medium/Hard bots in the lobby, changing their color, character and difficulty, and removing them (desktop and 375 px); a game full with bots locked to newcomers; starting alone with bots; bots claiming, opening pods, fabricating, building, switching to the Harvester and shooting in a real match, with a clean console. Not yet: playing seriously against each difficulty to judge whether it feels right (the numbers are tuned in simulation only).
- **Upgrade levels, the equipped slot and the Inventory** (2026-09-26: `UpgradeSystem.spec.ts`, `ShopSystem.spec.ts`, `Inventory.spec.tsx` (removed with the popup), `FabricatorMenu.spec.tsx` (earlier `BuyMenu.spec.tsx`), `e2e.js` (the Robot switching its Booster), browser): Booster/Harvester/Armor to level 3 and Jetpack 1 at 100 materials a level; one slot upgrade works at a time with a 5 s switch cooldown; Jetpack can't come off over solid terrain; Armor always on (+100 max health a level). In the browser: the shop offers the next level, the Inventory opens with `I` or its button and equips.
- **Terrain: generation, drawing, rules and Jetpack** (2026-09-26: `terrainRules.spec.ts` for movement, claiming, shots and Jetpack; `terrain.spec.ts` over 40 maps, `e2e.js`, browser): a random map per room, ~10% mountains/lakes/rivers within the size, separation, spawn-clear and reachability rules, synced to every client and drawn with its colors and borders. Mountains and deep water are solid (except with Jetpack), terrain can't be claimed, mountains stop shots. Jetpack haven't been flown in a browser yet: nobody can afford 100 materials at the start, so they're covered by the unit tests only.
- **Lobby, characters and teams** (2026-09-26: the rule checks now in the server specs, `tools/e2e.js`, and a two-tab browser pass on private ports): ready-up and the countdown (cancelled by un-readying or a newcomer; not held up by a disconnected player); team/character locked while ready and junk values refused; default teams fill empty colors first; every character's kit applied exactly at match start (and to a mid-match joiner); unarmed players can't shoot; the Blaster arms you, once; structures come out of the inventory and carry their type; the Robot's Booster; no friendly fire on teammates or their structures, teammates' structures walkable, teammates' tiles not taken; standings carry `teamId`. In the browser: the lobby at desktop and 375px width, Explorer HUD kit, building the Farmer's farm (score +25, Build button disabled after), buying the Blaster.
- **Player names** (2026-09-26: the server specs, `e2e.js`, and the browser): normalization and the 2–25 limit (emoji count as one), unique "(N)" suffixes ignoring case and still within 25, "Player N" fallback, renaming while ready but not mid-match, the join option. In the browser: the invalid hint on a 1-character name, Enter commits, the name saved to localStorage, and a second tab joining as "… (1)" with it; the row at 375px. Safari itself wasn't available to test the select fix.
- Join, phase timers, materials payout, HUD, leaderboard (browser).
- **Disconnect notices, reconnect, screen edge** (headless clients + browser, 2026-09-20): both other players get disconnect and reconnect events (the returning player doesn't); toasts show and fade; a tab reconnects in ~330 ms when it becomes visible (simulated); players stop exactly 20 px inside the map edge and the camera keeps them centered and fully visible there.
- **Shop: ammo and Harvester** (unit + brute-force scripts and the browser, 2026-09-20): purchases validated (affordability, one Harvester per player, junk ids rejected); radius claiming matches a brute-force scan; the shop UI buys ammo and the Harvester, the tinted ring appears in the player's color, and enemy structures protect their hexes from claiming.
- **Results screen, right-click move** (server scripts + browser, 2026-09-20): the server broadcasts a correctly ordered `gameOver` snapshot to everyone; the results screen shows it, counts down, persists after the room closes, and *Play again* joins a fresh lobby; right-click walks to a spot and stops without overshoot, and arrow keys/WASD cancel it.
- **Shop popup and room closing** (scripts with scaled phase times, plus the browser, 2026-09-20; the `buying` phase this was verified with was removed 2026-09-26): the shop toggles with the Shop button / `B` (`Esc` closes; only one popup at a time); at the end the finished room is locked, closes on its 60s timer (or at once when the last player leaves), and the client returns to the connect screen without a reconnect loop.
- **Merged `playing` phase, new score, 50 damage, solid structures** (scripts + a two-client end-to-end run on 2026-09-20): shooting works the instant the match starts; score = tiles (+25 per structure, +50 per kill) with materials excluded; a structure blocks other players, who slide around it (744-approach sweep: 0 overlaps, 0 frozen), while its owner passes through; two hits kill. The merged-phase UI has had only a short browser look (see Testing).
- **Combat controls and UI** (third browser pass): Space/click firing with the fire interval, the projectile placeholder art in flight, hold-to-fire on the mobile FIRE button (release verified), building on a hex on touch, the always-visible score badge, the leaderboard popup (button, `L`, `Esc`), separate borders on claimed hexes, and no page scrollbars.
- **Hex map + isometric rendering**: terrain draws correctly; the hover outline lands exactly on the hex under the mouse (picking matches the drawn grid); under the first (mouse-relative) control scheme, `W` carried the player diagonally toward the cursor and claimed a line of hexes — the default is now on-screen WASD, which has been typechecked but **not yet re-run in a browser**; a click in combat fires a shot (ammo 30 → 29) (browser).
- Hex math round-trips exactly for all 4,096 tiles; velocity ramp/turn/decel numbers; off-map positions don't claim; stale input is dropped after 750ms (scripts).
- Reconnection token flow and the projectile/structure/phase server logic (scripts).

### Implemented but not yet exercised in a real browser
The results screen's team table, a real match between armed teammates and enemies (friendly fire is script-verified only), upgrades bought and switched in a real match (Jetpack flown over terrain, Harvester 2–3, Armor 2–3), Structure *destruction* by shots, projectile hits on other players, the mobile joystick and `unproject` conversion on a real touch device (only emulated in a pane), the leaderboard with more than one player, reconnect after refresh/drop, real multi-player sessions, the results screen, and the stale-input fix under a genuinely backgrounded tab.

### Known bugs / rough edges

Design gaps (ammo supply, identical structure types, team balance, early-game pacing, spawn positions, terrain) are tracked in [GAME_DESIGN → Open design questions](GAME_DESIGN.md#open-design-questions-and-plans), not here.

- **The connect screen still uses the Vite template's layout** (`#root`/`App.css`: fixed 1126px column, centered text, leftover hero/counter styles). The lobby, game and results screens are viewport-fixed. Cosmetic.
- **No server-side fire-rate limit.** The cooldown (`GUN_FIRE_INTERVAL_MS`) lives in the client (`tryShoot`) for people; towers (`TowerSystem`) and bots (`BotSystem.shoot`, never faster than their gun) keep to it on the server; a modified client can spend all its ammo in one tick. Ammo is finite, so it's bounded, but the server should own this (e.g. a per-player last-shot timestamp in `GameRoom.handleShoot`) — a game-rule decision, so not done yet.
- **Results screen is basic.** No winner tie-break beyond shared ranks, no per-player details or match stats, and "Play again" starts a *new* lobby rather than a rematch in the same room. The server also doesn't tell late-leaving players anything special.
- **No client-side prediction.** Rendering is smoothed and extrapolated, but your own movement still waits for the server round trip (see Movement). Fine on localhost; needs work before real-world latency.
- **Map corners aren't hex-covered:** movement is clamped to the map rectangle, but the hex edge is jagged, so a player can stand over no hex (claiming ignores it). The biggest such spot is the top-right corner: the last column (63) is odd, so it's shifted down half a hex. Players now start near the east edge (2026-09-26), so they're likelier to wander there; `tools/e2e.js` pushes into the bottom-right corner rather than the top-right for this reason.
- **Placeholder art everywhere:** terrain is flat colored hexes (no elevation, by design since 2026-09-26) and players are circles. (Structures have drawn art since 2026-10-03; their menu icons are small SVG pictures of them, `StructureIcon`.) Mountains and water have drawn (code-generated) graphics since 2026-09-29, still placeholders for real art (Planned Features #7).
- **Shots are hit-tested at one size.** Ion Cannon bolts are drawn larger than basic ones, but both use the same server hit radius (`PROJECTILE_RADIUS` 6), so a big bolt can visually graze a player without hitting.
- **Other players' lobby rows wrap loosely at phone width** (team, character and "Not ready" land on separate lines). Cosmetic; to revisit with the character picker (Planned Features #10).
- **A backgrounded tab's dropped connection: partly addressed.** Reported 2026-09-20 (Chrome blue vs Safari red: blue vanished from Safari's view). Fixed since: dropped players are drawn dimmed instead of hidden, everyone gets disconnect/reconnect notices, failed reconnects keep retrying for the whole window, and a tab reconnects immediately when it becomes visible. **Still unconfirmed:** *why* blue's connection dropped in the first place (likely browser throttling/freezing of the hidden tab), and the visible-tab trigger was tested by simulating the visibility change, not with a real backgrounded browser. When testing with two browsers, keep both windows visible. Untested idea: an indicator for players who are off-screen.
- **A ~19 fps report on the developer's machine (two browsers open) is unexplained.** The measurable scaling problems were fixed (see Performance pass), but it was never reproduced. Next step: the backtick readout's fps, ms/frame and renderer line from that machine — low fps with small ms/frame points at the GPU/browser (software WebGL, two windows sharing a GPU), not the game code.
- **Reconnect retries are fixed-interval** (1.5 s, capped at 120 attempts ≈ 3 min) — no backoff.
- **Client bundle ~1.7MB** (Phaser) — Vite chunk-size warning, no code-splitting yet.
- **Mobile:** aiming on touch is limited to the movement direction or a tapped point (no second stick); phone-width layout only spot-checked at 375px (see Testing).
- **No "player left" notice** for a deliberate leave or an expired reconnect window — only disconnect/reconnect are announced.
- **Contested tile claims** resolve by player join order, not input `seq`.
- **Node version is not enforced** (no `.nvmrc` / `engines`) — see Tech Stack.
- **Dev-server restarts drop every room.** `ts-node-dev --respawn` restarts on any file change (including `tsconfig.json` and a plain `touch`), which wipes in-memory rooms and disconnects clients mid-game. Expected, but surprising when two people share one dev server.

### Open questions and ideas
1. **Should the project move off Colyseus?** Raised because of the repeated client/server compatibility problems (see Tech Stack items 1–5). Not decided. Considerations: the published `colyseus.js` client tops out at 0.16.22, so the server is stuck on the 0.16 line with exact pins; the pain so far has been version/config drift rather than fundamental design limits, and everything is now working and verified on the pinned versions. Alternatives (raw `ws` + own delta sync, or another framework) would mean re-implementing rooms, delta-compressed state sync, and reconnection.
2. **Gameplay questions** (starting positions, structure purposes, balance and others) are in [GAME_DESIGN → Open design questions](GAME_DESIGN.md#open-design-questions-and-plans).

---

## Planned Features

Captured 2026-09-20 as design ideas; the Phaser game view work session that followed (also 2026-09-20) implemented several of them along the way. Status is marked per item below — see the Decisions Log for what changed and why. The gameplay side of these items (what to build and why) is in [GAME_DESIGN → Open design questions](GAME_DESIGN.md#open-design-questions-and-plans); this section keeps the implementation notes.

### 1. Materials (economy) — ✅ implemented

> **Superseded 2026-09-26:** income is now `MATERIALS_PER_CLAIM` per hex claimed; the timed payout and `nextPayoutAt` below are gone. See Game Mechanics → *Economy (Materials)*.

- `Player.materials: number` (synced schema field) and `GameState.nextPayoutAt: number` (server timestamp of the next payout, same pattern as `GamePhaseState.endsAt`).
- `server/src/systems/EconomySystem.ts`: every `CREDIT_PAYOUT_INTERVAL_MS` (10s, in `constants.ts`), every player with `tilesOwned > 0` gets `materials += tilesOwned`. Runs only during `playing` — payouts stop once `results` begins, per the open question raised when this was planned.
- Wired into `GameRoom.tick()` alongside the other systems; `nextPayoutAt` is initialized in `onCreate()`.
- Verified live: a throwaway script joined, claimed tiles, waited 11s, and confirmed `materials` incremented by exactly `tilesOwned` after one payout cycle.

### 2. Teams — first version ✅ implemented (2026-09-26)

Built as described in [Lobby, characters and teams](#lobby-characters-and-teams): teams are the colors (8, then 10 from 2026-10-03) in the shared `TEAMS` catalog, chosen in the lobby (`selectTeam`), stored as `Player.teamId` (no separate `GameState.teams` map — a team has no state of its own yet). Teammates are allies: no friendly fire on players or structures, teammates' structures are walkable, and teammates don't take each other's tiles. **Tiles, materials and score stay per player** (tile-ownership option (a) from the original plan, without pooling); the results screen sums scores per team.

Still open (pooling, a team win condition, team size and balancing): see [GAME_DESIGN → Teams](GAME_DESIGN.md#teams-planned-features-2). Technically, pooled tiles would mean `Tile.ownerId` = team id, and pooled materials would split each payout between teammates (with a remainder rule); either changes `CollisionSystem`, `EconomySystem` and `ScoreSystem`.

### 3. Scoring and win condition — scoring ✅ implemented (first version); win condition not yet

- **Implemented (2026-09-20; structures changed 2026-10-03):** `Player.score` = tiles × 1 + kills × 0 (was 50 until 2026-10-03) + the per-type points of each structure, computed by `ScoreSystem` (see [Score](#score)); materials are excluded. The score badge and leaderboard show it. Match length is a single 5-minute `playing` phase (`MATCH_DURATION_MS`).
- **Still to do:**
  - Structure types with their own values: `Structure.type` and `placeStructure.structureType` **exist since 2026-09-26** (farm, mine, fort, power plant — the characters' starting structures; the earlier idea was city hall 1000, school 250, house 100, fort 25). **Done 2026-10-03:** per-type points, health and cost (`STRUCTURE_SPECS`) and jobs for the farm (tile limit), fabricator (unlocks the Fabricator) and Guard Tower (shoots). Still needed: what the power plant *does*. (More can be bought in the shop since 2026-09-26, 100 materials each; see #9.)
  - The win condition: **displayed** on the results screen (highest score wins, co-winners on a tie; see [Results screen](#results-screen)), but not yet more than that — team-level scoring (sum or average, decide) once teams exist, and a real tie-break, are still open.
  - The point values are first-pass numbers to tune in playtesting; the formula is expected to change as the buy menu lands.

### 4. HUD (materials + score) — ✅ implemented

`client/src/components/HUD.tsx` — a React overlay (not a Phaser `UIScene`; see [Client — Phaser Game](#client--phaser-game) for why) rendered on top of the Phaser canvas by `GameScreen`. Shows the current phase and countdown, and the local player's health, ammo, tiles owned, and materials. A separate always-visible **score badge** (`ScoreBadge.tsx`, top center) shows the player's score (`utils/score.ts`; see #3). The HUD also shows the gun, structures left, the equipped upgrade and the Armor level.

### 5. Leaderboard / player-status info panel — ✅ implemented

`client/src/components/Leaderboard.tsx` — a popup over the canvas (toggled by a button or the `L` key) listing every player sorted by `scoreFor` (the score from #3), showing tiles/kills/connection status too. Needs no server changes beyond the fields it already reads — it's driven entirely by `GameContext`'s existing reactive `players` array.

### 6. Mobile web controls — ✅ implemented

- `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built with pointer events (not a Phaser plugin), reporting the on-screen stick deflection. `GameScreen` shows it when `utils/device.ts`'s `isTouchDevice()` check passes, and it feeds `GameScene.setJoystick()`, which converts it to a world-space direction and sends it through the same throttle/dedupe path the keyboard uses (see [Client — Phaser Game](#client--phaser-game)) — no separate server-side handling needed, confirming the original prediction that the existing `input`/`shoot` message shapes already supported this.
- **Fire button:** `FireButton.tsx` (touch + during the match only) holds `GameScene.setFireHeld(true)` while pressed; the scene repeats shots at the fire interval along the current aim. Tapping the map still aims and fires toward the tap, and arms placement when Build is on — the same handlers serve mouse and touch. Verified in a 375×812 touch-emulated pane: it fires (ammo 30 → 29), releases cleanly (no runaway fire), and Build correctly places a structure without also shooting.
- Not yet done: a second aim stick (touch aim is movement direction or tap), and responsive tuning beyond a 375px spot check (HUD, score badge and Leaderboard button fit on one row without overlapping, though the HUD is close to the badge once the countdown reaches three digits).

### 7. Terrain, elevation, and real art — terrain ✅ built (2026-09-26); elevation dropped; art not started

Driven by reference art showing hex tiles with mountains, trees, water and cliff faces.
- **Decided 2026-09-26: gameplay terrain, no elevation.** Ground, mountain and water, randomly generated per match; mountains and deep water block movement (unless the player has Jetpack), mountains block shots, neither can be claimed. The rules are in [GAME_DESIGN.md → Terrain](GAME_DESIGN.md#terrain). **Built (all three steps: generation and drawing, the rules, Jetpack)**; see [Terrain](#terrain).
- **Rendering with elevation** (*dropped 2026-09-26*, kept for reference): the static base layer must draw tiles back-to-front with each tile's cliff height, so heights vary per tile; tall props (mountains, trees, structures) need depth sorting against players using `setDepth(projectedY)` like entities already do. Keep the top-down world as the source of truth and add height only as a render offset.
- **Art:** the reference image is AI-generated (watermarked, irregular tile shapes, unclear licensing) — treat it as mood only. Real tiles need a consistent hex footprint (64 × ~55 px top at the current size/squash, plus cliff height) so sprites tile cleanly; sprites replace `GameScene`'s primitives without an architecture change (needs a preload step, since the scene currently loads nothing). Mountain sprites also need each mountain's pieces (small = 3 hexes, large = 7), which `generateTerrain` knows but doesn't sync: add them to the state or regenerate from a synced seed.
- **Six-direction character sprites:** flat-top hexes suggest six facings (0°, 60°, 120°, 180°, 240°, 300°) with one animation each. Pick the animation from the *projected* (on-screen) velocity, not the world one, because the iso squash bends the angles — bucket the screen angle to the nearest of the six hex-neighbor directions as they appear on screen. Movement itself stays free-form vector velocity (already server-authoritative), so this is purely a visual layer and needs no protocol change; idle = stop the animation. (Phaser arcade physics, often shown alongside this technique, isn't involved: the server owns all movement and collision.)
- **Map shape:** the jagged hex edge vs. rectangular movement bounds (see Known Issues) is worth fixing at the same time, e.g. by clamping to the nearest valid hex.

### 8. Client-side prediction — not implemented

Simulate the local player with the same acceleration model as `MovementSystem` (share the step function between client and server), replay unacknowledged inputs against each authoritative update (the `seq`/`inputAck` plumbing already exists for this), and correct smoothly. Do this once latency is a real concern; the extrapolation/smoothing already in place hides tick-rate stepping but not round-trip delay.

### 9. Shop, upgrades and inventory — ✅ built (2026-09-26); balance still open

**Where it lives:** during play, on the player's own time (a Shop button or `E`; nothing pauses while it's open). A 30-second `buying` phase before play existed from 2026-09-20 until **2026-09-26**, when the ready-up lobby replaced it; starting materials now come from the character (50, or 15 for the Explorer).

**Built (2026-09-20):** the menu (`BuyMenu.tsx`) lists real items with prices and Buy buttons — **Ammo pack** (30 materials for 30 shots) and **Harvester** (100 materials; claim radius ×2, one per player, with a tinted circle) — see [Shop](#shop). Buttons disable when you can't afford an item or already own it. Below them a "coming soon" list shows the ideas that aren't buyable yet (better gun, armor, structures). The **Blaster** was added 2026-09-26, since only the Explorer starts armed. (The temporary `endBuying` shortcut went with the buying phase.) **Later on 2026-09-26** the catalog became data-driven and gained the Ion Cannon, Speed boost, Armor and all four structures, the Blaster went to 100, and the "coming soon" list was removed — see [Shop](#shop). **Later still:** upgrades got levels (Booster, Harvester and Armor to 3, Jetpack 1; 100 materials a level), one slot upgrade is equipped at a time (5 s switch cooldown; Armor is always on), and the **Inventory** popup (`I`) shows guns, ammo, structures and upgrades and switches the slot.

**Still to design and build:** the open questions (ammo cap, per-gun fire rate, more items, shopping risk, snowballing) are in [GAME_DESIGN → Shop, weapons and balance](GAME_DESIGN.md#shop-weapons-and-balance-planned-features-9). Technically: a new item is an entry in `SHOP_ITEMS` (a new *kind* of effect also needs a line in `ShopSystem`), and a per-gun fire rate means a server-side fire-rate check in `GameRoom.handleShoot`. The Shop button and popup fit a 375px viewport in principle but haven't been tried on a real device.

### 10. Custom lobby pickers — color picker ✅ built (2026-10-03); character picker planned (requested 2026-09-26)

Replace the lobby's native `<select>`s (the character and difficulty ones are still restyled with `appearance: none` as a stopgap):
- **Team picker:** ✅ built 2026-10-03 as `components/ColorPicker.tsx`. The closed state is a swatch button (30px) in the current color (`aria-haspopup="dialog"`, named "Color: Red" / "Team color: Red", "… for Bo: …" on a bot's row). Clicking opens a `role="dialog"` titled "Color" or "Team color" holding a `role="radiogroup"` of 10 swatch buttons (`role="radio"`) in a 5-column grid, so two rows. The chosen swatch is ringed; with teams off (`exclusive`) a color another player has is dimmed, crossed out and disabled ("Blue (taken)"), with teams on a count badge shows the players on it. Opening focuses the chosen swatch; arrows move by one or by a row (skipping taken ones); Enter/Space picks; Esc, a click outside, picking or the swatch itself close it, and it closes if you ready up while it is open. Its CSS (`COLOR_PICKER_CSS`, prefixed `cp-`) is added to the lobby's. **Touch size (2026-10-03):** the trigger and swatches are sized by one CSS variable, `--cp-size`: 30px normally and **44px** (gap 10px instead of 8px) under `@media (pointer: coarse)`, so the grid is 5 × 44 + gaps ≈ 286px wide with padding and still fits a 375px phone (`max-width: calc(100vw - 24px)` guards narrower ones). A device with both a mouse and a touch screen follows its primary pointer. The picked color shows on the swatch once the server's state patch arrives (a moment later), as the select did.
- **Character picker:** a custom component — likely cards with the character's art (once there is art, #7) and kit, rather than a text list.
- Tidy other players' rows at phone width at the same time (see Known Issues).

### 11. Inventory on the HUD — ✅ built (2026-09-27)

See *Inventory bar* under Client — React Shell; rules in [GAME_DESIGN → Inventory bar](GAME_DESIGN.md#inventory-bar). Follow-ups (number-key shortcuts, gun and ammo in the bar) are in GAME_DESIGN's open questions.

---


## Decisions Log

Technical decisions: how the game is built. Gameplay, balance, controls and presentation decisions are in [GAME_DESIGN → Design decisions log](GAME_DESIGN.md#design-decisions-log).

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| Server framework | Colyseus | raw `ws`, uWebSockets.js | Built-in delta sync, reconnection, room management |
| Server runtime | Node.js | Deno, Bun | Most mature; best ecosystem for Colyseus |
| Server scaling | Single Node instance | Redis pub/sub, multi-instance | Sufficient at target player count (≤10/room) |
| Client rendering | Phaser (v4.2.1 installed; earlier drafts said 3) | Three.js, plain Canvas | 2D-optimized, tile grid support, particle effects |
| Client UI framework | React (v19 installed; earlier drafts said 18) | Lit.js, vanilla JS | Familiarity goal; good component model for lobby/menus |
| Client bundler | Vite (client only) | Webpack, Parcel | Fast HMR, zero-config TS+React, modern standard. Server does **not** use Vite — plain `tsc` build + `ts-node-dev` for hot reload, since Vite targets browser bundling |
| Transport protocol | WebSockets (via Colyseus) | WebRTC, SSE, polling | Right latency profile; server-authoritative; P2P not needed at this scale |
| Collision detection | Home-rolled distance / hex containment | Rapier, Planck.js, P2.js | Sufficient complexity; physics engine is overkill for this game type |
| Structure destruction | Health-based discrete | Voxel blocks, physics deformation | Simplest to implement, easiest to sync over network, easiest to balance |
| Reconnect window | 3 minutes | Immediate drop, longer window | Reasonable for casual play; short enough not to stall match indefinitely |
| Reconnect behavior | Freeze entity in place, retain tiles | Drop entity, release tiles | Fairer to reconnecting player; avoiding incentivizing disconnect |
| State serialization | Colyseus schema (binary delta) | JSON, MessagePack, Protobuf | Automatic, zero-config delta compression baked into framework |
| Tick rate | 20Hz | 10Hz, 30Hz, 60Hz | Good balance for tile/territory game; not a twitchy shooter |
| Language | TypeScript (client + server) | JavaScript | Type safety; shared type definitions between client and server |
| Linting | ESLint 10 flat config (both projects) | oxlint (Vite's default), legacy `.eslintrc.json` | Vite 8's default `oxlint` was swapped for full ESLint to get typescript-eslint + React rules; ESLint 10 requires flat config, so `.eslintrc.json` from older docs doesn't apply |
| TypeScript version pin | `~6.0.2` on both projects | Latest (7.x) | `typescript-eslint` 8.70 currently requires TS `<6.1.0` as a peer dependency |
| Cross-system event emission | Plain `Broadcast` callback type (`(type, payload) => void`) passed into each system's `update()` | Systems import the Room directly; a shared EventEmitter singleton; Room does all broadcasting itself, systems return event lists | Keeps systems as pure-ish functions operating only on `GameState` + a callback, so they're testable without a live Colyseus `Room` — see the direct system tests in Testing Multiplayer Locally, which exist specifically because client-side end-to-end testing is currently blocked |
| Per-projectile lifetime tracking | Store `spawnedAt` on the `Projectile` schema itself | Module-level `Map<id, timestamp>` inside `CombatSystem` | Systems are shared singletons imported once and reused by every `GameRoom` instance — module-level mutable state keyed by projectile id would leak across concurrent rooms. Storing it on the synced schema costs a few bytes per projectile but is correct per-room and per-instance |
| Client input storage field name | `playerInputs` | `inputs` (matches the original message-shape naming) | `Room` reserves the property name `inputs` for its own built-in input-buffering API in this Colyseus version; naming a subclass field `inputs` fails to compile |
| Contested tile-claim resolution | Iteration order over `state.players` (join order) | Resolve by earliest input `seq`, as originally planned | Not yet implemented as designed — flagged as a known gap in Testing Multiplayer Locally rather than silently left inconsistent with the original design |
| Client networking library / server version pairing | `colyseus.js@0.16.22` (the only published client) against `colyseus@0.16.5` + `@colyseus/schema@^3.0.76` on the server | Server on `colyseus@^0.18` / `@colyseus/schema@^5.0` (the original scaffold choice) | The server was originally scaffolded on the 0.18 line, but no published `colyseus.js` client supports it — confirmed via a direct `curl` comparison showing the matchmake HTTP response shape itself changed (nested `{room:{...}}` vs flat), not just the schema encoding. Downgraded the server to the one version line with a verified-compatible client, and confirmed end-to-end with a live join/decode/message-round-trip test (see Testing Multiplayer Locally) |
| `useDefineForClassFields` on the server | `false` | `true` (TypeScript's default at `target: "ES2022"`, i.e. leaving it unset) | Left unset, class field initializers compile to `Object.defineProperty` in the constructor, which overwrites the getter/setter `@colyseus/schema`'s legacy `@type()` decorator installs on the prototype for change tracking. This produced no compile error and no symptom until the first client join, when the server crashed encoding full state — a second, independent bug found only by testing a real client against a real server rather than trusting either side's isolated build/lint/typecheck passing |
| HUD/leaderboard implementation | React overlay components (`HUD.tsx`, `Leaderboard.tsx`) absolutely positioned over the Phaser canvas | A Phaser `UIScene` (as in the original sketch) | `GameContext` already keeps `players`/`phase` reactive on the React side (via `getStateCallbacks`); a `UIScene` would need to re-derive that same reactivity inside Phaser purely to re-display it. Overlaying React avoids the duplication and lets the HUD/leaderboard reuse the exact state the lobby screen already renders |
| Phaser scene structure | One `GameScene` handling tiles, all entity types, camera, and input | Split `TileRenderer`/`PlayerRenderer`/`ProjectileRenderer`/`StructureRenderer`/`InputHandler` files, as the original sketch proposed | Premature separation for a first working version — the single-file scene is small enough to stay readable; splitting it out is easy to do later once/if it grows |
| Mobile movement input | A hand-built drag joystick (`MobileJoystick.tsx`, plain pointer events, no external dependency) | A Phaser plugin (e.g. `phaser3-rex-plugins`'s virtual joystick), as the original plan suggested | Avoids a new dependency for a fairly small amount of pointer-event math, and keeps the control as a React component consistent with the rest of the UI overlay (HUD, leaderboard, build button) rather than mixing input-handling styles between Phaser and React |
| Structure/tile rendering | Plain Phaser primitives (`add.circle`/`add.rectangle`/a shared `Graphics`) | Sprite-based rendering with a `PreloadScene` loading art assets, as the original sketch proposed | No art assets exist yet; primitives need no preloading and are enough to validate the networking/rendering pipeline. Swapping in real sprites later is a `GameScene` change only, not an architecture change |
| Pinning `@colyseus/core` | Exact-pin all four Colyseus packages (`colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5), no `^` | Leave `@colyseus/core` to resolve as a peer dependency | It is only a peer of `colyseus`/`ws-transport`, so an unpinned install resolved it to 0.18.14, whose `Room` generics and `onLeave` signature are incompatible with 0.16 and broke `tsc`. Exact pins plus a lockfile regenerated from a clean install prevent silent drift (2026-09-20) |
| Publishing the room to React | `GameContext.connect()` waits for the first state (`onStateChange.once`) before `setRoom`/`setStatus('connected')` | Publish the room as soon as `joinOrCreate` resolves and null-check `state` everywhere | The join promise resolves before the initial full-state message is decoded, so `room.state.phase` is undefined at that moment. Waiting once at the boundary lets every consumer assume populated state |
| `<GameProvider>` placement | Wrap `<App />` in `main.tsx` | Provide the context lower in the tree, or make `useGameConnection()` tolerate a missing provider | `App` itself consumes the context, so the provider must sit above it. Missing it gave a fully blank page with only a console error; the hook's throw is intentional, since it surfaces the mistake immediately |
| Version-drift guardrails | Document exact pins and the "run a real client against a real server" check; `.nvmrc`/`engines` not yet added | Trust isolated build/lint passes | Three of the five compatibility bugs to date (the matchmake protocol mismatch, the `useDefineForClassFields` encode crash, and that setting missing from the committed `tsconfig.json`) passed every per-side build/lint check and surfaced only when a real client joined a real server; the other two (`@colyseus/core` peer drift, `index.ts` on the 0.18 API) were caught by `tsc`. Separately, a Node 13 default shell can't run TS 6 at all |
| Whether to leave Colyseus | **Undecided** — staying on pinned 0.16.x for now | Raw `ws` + custom sync; another framework | Because of the compatibility churn in early development. Everything works and is verified on the pinned versions, and replacing rooms/delta sync/reconnection is a large cost; revisit if the 0.16 line's lack of updates or a needed feature becomes a real blocker |
| Git workflow | The user runs all git commands; Claude edits files and asks the user to commit | Claude commits/pushes | Stated preference in `CLAUDE.md` — the user wants to review what's being committed |
| Map grid | Flat-top hexes, odd-q offset, stored in the same flat array (`row * cols + col`); axial/cube coordinates used only inside `pixelToHex` | Keep square tiles; pointy-top; axial storage | Hexes are the intended design. Odd-q keeps the map rectangular and the schema/array unchanged, and flat-top matches the reference art. Only tile lookup, structure hits, bounds and rendering had to change — claiming is by position, not adjacency, so this was cheap to do before teams/structure types |
| Isometric implementation | Render-only vertical squash (`ISO_SQUASH = 0.6`) of a top-down world; server never sees it | True 45° isometric projection; simulating in screen space | A single scale factor gives the ~2:1 hex look of the reference, keeps server hex/collision/movement simple, and inverts trivially. The cost — every pointer/joystick vector must be `unproject`ed before use — is confined to `GameScene` |
| Movement model | Acceleration-limited velocity (`PLAYER_ACCEL`), world-space input vector (magnitude = speed) + facing angle | Instantly setting velocity from the input (previous behavior); stepping tile to tile | Smooth start/stop/turn at any angle and analog joystick speed, with a server change only in `MovementSystem`. `vx`/`vy`/`angle` are synced so clients can extrapolate and draw facing |
| Speed metric | Uniform on screen: server measures speed/acceleration with world y scaled by `SCREEN_Y_SCALE` (= client `ISO_SQUASH`); client `UNIFORM_SCREEN_SPEED` sends the unnormalized `unproject`ed direction | Uniform in world space (previous behavior: up/down looked ~40% slower) | Requested after playtesting: with the tilted view, equal world speed reads as slower vertical movement. Costs a little "purity" (server knows the tilt) and makes vertical world distance/hexes cross faster. Reversible with `SCREEN_Y_SCALE = 1` + `UNIFORM_SCREEN_SPEED = false`. Projectiles use the same rule (see PvP Shooting) |
| Swept projectile-vs-player test | Test the segment each projectile travelled this tick against the player's circle | End-point-only distance check (previous) | Making vertical shots screen-uniform raised their step to ~33 world px/tick vs a 22 px hit radius; grazing shots then skipped players (56–75% hit rate at the hitbox edge). Sweeping fixes it for every direction (100% in a Monte Carlo test) at the cost of a few multiplications per projectile-player pair |
| Score display | `scoreFor(player)` in `utils/score.ts` returns materials for now; used by the badge and leaderboard | Show materials directly everywhere; design and build the scoring formula now | Real scoring has open questions (Planned Features #3), but the UI needs *a* score now. Routing through one function makes the eventual formula a one-line swap without touching components |
| Claimed-hex borders | Re-stroke each claimed hex with a darkened version of its own fill | Draw claims beneath the base outline; leave as one flat color | The claim fill covers the base outline, merging adjacent same-color hexes into a blob. Darkening the fill (not a fixed color) keeps borders visible on every player color |
| Game screen container | `position: fixed; inset: 0` | `100vw × 100vh` inside the template `#root` (previous) | The template `#root` (1126px, min-height) plus 100vw/100vh produced scrollbars and clipped right-side overlays; fixed positioning takes the game out of that flow entirely |
| Terrain rendering | Bake the base and claims layers into `RenderTexture`s (re-bake claims only when dirty) | Leave them as `Graphics` objects (previous) | Measured in the browser: with the base layer as `Graphics`, a frame cost ~53 ms of JS (hiding it dropped that to <1 ms), i.e. <20 fps; baked, it's ~0.75 ms/frame. Costs one ~3088×2157 texture (~26 MB) and needs a GPU max texture size ≥ that (fine on desktop; worth chunking for older mobile GPUs) |
| Finished-room lifecycle | Lock the room when the match ends; close it after a 60s results period (`RESULTS_DURATION_MS`) or immediately when the last player leaves; no reconnect window during `results` | Leave finished rooms open (previous); a 2–3 minute grace period | Finished rooms were being reused by `joinOrCreate`. There's no formal standard for the timeout; a minute is enough to look at results, and there's no results screen/rematch to justify longer. One constant to change |
| Server-closed room vs. client | Client treats close codes 1000 and 4000 as deliberate | Only 1000 (previous) | The server closes finished rooms with Colyseus's `CONSENTED` code (4000); treating it as a dropped connection would send the client into its reconnect loop and silently into a new lobby |
| `PHASE_TIME_SCALE` | Env var scaling all phase lengths, read once in `constants.ts` | Editing constants for tests; waiting real time | Testing the full lifecycle took minutes of waiting per browser run; a scale of 0.02–0.1 runs a whole match in seconds without touching code. Not for production use |
| Results screen data | The server sends one `gameOver` snapshot of final standings; the client keeps it in context and shows the screen even after the room closes | Read live room state; a screen that needs the room to stay open | Live state changes if someone leaves and vanishes when the room closes. A snapshot is stable and lets the screen outlive the room. Ties share a rank (no tie-break yet) |
| Claim layer rendering | 512-px chunk `RenderTexture`s, re-baking only chunks whose hex owners changed (diff against `renderedOwners`) | One full-map claim texture re-baked on every change (previous); per-hex incremental stamping | Re-bake cost grew with every claimed hex (7.7 ms at 442 → projected ~20 ms at ~1,100) and would spike late in a match; chunks bound it (2.3 ms flat). Per-hex stamping was rejected: the 2px claim border spills onto neighbors, so un-claiming a hex would leave artifacts unless its neighbors were repainted too. Chunks keep the exact previous visuals and the same "redraw what's claimed here from state" logic |
| React roster updates | Publish a new `players` array only when a *displayed* field changes (signature check) | Publish on every Colyseus `onChange` (previous) | Positions/velocity/aim change every tick per moving player and are never shown in React, yet each one re-rendered the whole provider tree (~30 renders/s measured). Now ~6/s |
| GPU selection | `powerPreference: 'high-performance'` | Browser default | Dual-GPU laptops default to the integrated GPU; the game is a good reason to ask for the discrete one. Harmless elsewhere |
| Shop catalog location | One `SHOP_ITEMS` block in `types/shared.ts`, mirrored on both sides | Prices hard-coded in the server and duplicated in the client menu | Server validation and the menu read the same numbers, so a price change is one edit (in both hand-synced copies) instead of a silent mismatch |
| Claimed-hex border strength | `CLAIM_BORDER_DARKEN` 0.3, `CLAIM_BORDER_WIDTH` 1.5 (was 0.45 / 2) | Original stronger border; no border | Requested subtler lines: still enough to tell same-colored hexes apart, without a heavy grid over the owner's color. Both are single constants to tune |
| Shop button feedback | Real CSS (`:hover`, `:active`) plus a 700 ms green "✓" confirmation on press | Inline styles only; toast messages | Inline styles can't express hover/pressed states. The confirmation is shown when the button is pressed (the server accepts any purchase the button allowed); a server acknowledgment isn't sent, so a lost race would still flash |
| Disconnected players on screen | Keep drawing them, dimmed to 40% alpha | Hide them (previous behavior) | The server holds a dropped player's seat, tiles and body for the 3-minute reconnect window, and the body is still a valid target, so hiding it made a frozen, shootable player invisible while its territory stayed on the map. Dimmed makes "connection dropped" readable at a glance (the leaderboard also flags it) |
| Disconnect/reconnect notices | Server broadcasts `playerDisconnected` / `playerReconnected` (with names) to everyone but the returning player; client shows auto-dismissing toasts | Rely on the leaderboard's "(disconnected)" flag; notify only the host | Requested: all players should know. Toasts are visible where players actually look; the events already existed in the shared types |
| Reconnect triggers | Retry every 1.5 s for the length of the server window, and reconnect immediately on `visibilitychange` / `online` | Single retry timer; give up after one failed attempt (previous) | Hidden tabs throttle timers, and one failed attempt (e.g. right after waking) shouldn't strand the player on an error screen |
| Screen edge | Camera has no bounds (always centers the player); players stay `MAP_EDGE_MARGIN` inside the map | Keep the bounded camera; clamp the player to the visible screen | A bounded camera pinned the player against the screen edge at the map's edge, clipping the body. Centering always keeps them fully visible at any window size; the margin keeps the body on the terrain. Cost: empty space visible beyond the map |
| Stale input | Server discards input older than `INPUT_STALE_MS` (750ms); client keeps alive every 250ms | Trust the last input indefinitely (previous behavior) | A backgrounded tab pauses Phaser's loop, so "key released" never got sent and the player ran on forever. Any silent client (tab hidden, network stall) now coasts to a stop |
| Client smoothness | Frame-rate-independent exponential smoothing toward `state + velocity × EXTRAPOLATION_S`; snap on large jumps | Fixed per-frame lerp (previous); full client-side prediction now | Hides the 20Hz tick stepping at any frame rate for little code. Prediction/reconciliation is deferred (Planned Features #8) until latency actually matters |
| Hex rendering | Three `Graphics` layers: static base (drawn once), claims tint (dirty-flag redraw, claimed hexes only), hover outline | One `Graphics` redrawn on every `tilesClaimed`; one game object per tile | `tilesClaimed` fires nearly every tick while moving; redrawing 4,096 hexes with cliff faces each time was the expensive path. Only the small claims layer redraws |
| Structure hit test — **superseded 2026-09-26 (hexagon containment)** | Projectile is inside the structure's hex (`pixelToHex` equality) | Circle or AABB approximation of a hex | Exact for a structure that fills its whole hex, and no extra geometry |
| Countdown as its own phase | `countdown` phase (lobby screen still shown), owned by `LobbySystem` together with applying kits at its end | Keep `lobby` and use `endsAt > 0` as "counting down" | A self-describing phase string is clearer for the client, logs and tests; `PhaseSystem` now only times `playing` |
| Shop catalog | Data-driven `SHOP_ITEMS` with categories; each item names what it gives; shared `ownsShopItem` decides "already have it" for both server and menu | A hand-written case per item in `ShopSystem` and the menu (previous) | With ten items, keeping the rules in one table stops the server and the menu drifting apart |
| Shared code | A plain top-level `shared/` folder of TypeScript source, imported by relative path; each side's old files re-export it | Keep hand-copying (previous, with `check-rules` comparing copies); an npm workspaces package | One copy of everything both sides must agree on. Workspaces would hoist dependencies into one `node_modules`, and the project's worst bugs so far were Colyseus client/server version mismatches, so a dependency-free folder is the lower-risk option. Cost: the compiled server moved to `server/dist/server/src/` |
| Typing the synced state | Plain interfaces in `shared/state.ts` that the schema classes `implement`; the client casts `room.state` to them | The client importing the schema classes; keeping `gameState.ts` in sync by hand (previous) | The schema classes need decorators and `useDefineForClassFields: false`, which the client build shouldn't depend on. `implements` still catches the server dropping or retyping a field the client reads |
| Client tests | Vitest + jsdom + React Testing Library, spec files next to the code, configured in `vite.config.ts` | Jest (a second transform pipeline alongside Vite); Vitest browser mode (a real browser, heavier to run) | Vitest reuses the client's Vite config and TypeScript setup, so there's nothing extra to keep in step. jsdom is enough for the React UI; Phaser still needs a real browser |
| Server tests | Vitest specs next to the code, sharing `tsconfig.json`; a separate `tsconfig.build.json` keeps specs out of `dist/`; the old rule/collision scripts removed once ported | Keep the plain-Node `tools/` scripts alongside (two copies of every check); put specs in a separate `test/` tree | One copy of each check, found next to the code it covers, with Vitest's watch mode and failure diffs. `e2e.js` stays a script because it drives a real server process |
| Terrain data | Generated on the server, stored as `Tile.terrain` (`uint8`) and synced once with the initial state | Sync only a seed and generate on both sides from `shared/` | Simplest and authoritative: no determinism concerns across two builds, and terrain could later change mid-match. Costs ~4 KB once per join |
| Terrain generation | Grow features one at a time with a spacing rule; undo any feature that walls off ground; stop at a coverage target | Noise-based terrain (Perlin/simplex) with thresholds; generate-then-validate with full restarts | Growing features directly guarantees the exact size limits, contiguity and separation the design specifies, which thresholded noise doesn't. Per-feature undo makes every map valid on the first pass |
| Terrain previews | `tools/map-preview.js` renders whole generated maps to PNG with a built-in encoder (Node's zlib), seeded | Judging generation in-game only; an image library dependency | Tuning a generator by walking around one screen at a time is slow; a seeded full-map image makes before/after comparisons instant and needs nothing installed |
| Terrain collision | Push the player's circle back out of any solid hex it overlaps (edge normal, velocity into it dropped, 3 passes), checking the 7 hexes around the player | Reuse the structure approach (refuse moves that get closer) | Terrain walls are many hexes that zigzag; refusing moves catches on every concave corner, while pushing out slides along them. Structures keep their tested approach |
| Shots vs mountains | Check the end and the midpoint of each tick's travel | End point only; a full swept segment-vs-hex test | End point only let fast vertical shots skip mountain corners (a spec proves it); the midpoint closes that at a fraction of a full sweep's cost |
| Upgrade data | One numeric field per upgrade level (`boosterLevel`, …) plus `equippedUpgrade` / `upgradeSwitchReadyAt` on `Player` | A `MapSchema` of levels; keeping the `upgrades` list with repeats | Plain fields sync through the player's normal change events (no extra listeners on the client) and satisfy the shared `PlayerState` `implements` check, which a `MapSchema` doesn't. Adding an upgrade means adding a field, which is rare |
| Spawn slot storage | A plain, non-synced `spawnSlot` field on the `Player` schema class; slots picked as the lowest one no current player holds | A `Map<sessionId, slot>` in `GameRoom`; a synced `@type` field | `CombatSystem.respawnPlayer` needs the slot and only has `state`, so it lives on the player; clients never need it (they see positions). Computing free slots from the current players means a reconnect keeps its slot and a player who leaves for good frees theirs, with no extra bookkeeping |
| Build selection | Client-only: `GameScreen` holds the picked type and sends it in `placeStructure` | A synced "selected structure" field on the player | The server already accepted any type in your inventory, so no protocol change was needed |
| Claim income | Paid inside `CollisionSystem.claimTiles`, where the hex changes hands | A separate EconomySystem pass counting each tick's claims | The claim loop is the one place that knows a hex was taken; a second pass would have to re-derive it from the `tilesClaimed` batch |
| Dev materials gate | Client sends only in Vite dev builds; server refuses when `NODE_ENV=production` (`DEV_CHEATS_ENABLED`) | Client-side check only; an opt-in env var | A client check alone can be bypassed by anyone sending the message; `NODE_ENV=production` is already set by the hosting guide's service, so hosted servers are safe without extra setup, while `npm run dev`, `npm start` and `tools/e2e.js` keep it on |
| Pickup state | A `MapSchema<Pickup>` whose item pickups carry a `ShopItemId`, applied through `ShopSystem.grant` | One field per pickup kind; drawing items into the terrain | Reuses the shop catalog for names, effects and the can-use rules, so a new shop item works as a pickup for free; a map gives cheap add/remove callbacks for the client |
| First-claim tracking | A non-synced `claimedBefore` flag on each `Tile` | A `Set` of hex indices in `GameRoom`; a synced field | `claimTiles` already holds the tile; clients never need it |
| Pickups feature flag | A constant with an environment override (`PICKUPS`), checked once in `onCreate` | A client toggle; a per-room option | Matches `TERRAIN_COVERAGE`/`PHASE_TIME_SCALE`; checking at creation keeps every other code path flag-free (an empty map does nothing) |
| Credits → materials rename | Full rename, identifiers included: `Player.materials`, `MATERIALS_PER_CLAIM`, `DEV_MATERIALS`, `PICKUP_MATERIALS`, pickup kind `'materials'`, the `devMaterials` message | UI text only | One word for one concept in code and game. Client and server deploy together, so renaming a synced field and a message is safe; older doc text was reworded (the removed `CREDIT_PAYOUT_INTERVAL_MS` keeps its real name) |
| Fabricate rename | Player-facing text, hotkey (`F` places, `E` opens the menu), the menu component (`BuyMenu` → `FabricateMenu`) and the structure id (`mine` → `fabricator`) changed; the catalog and protocol keep their shop names (`SHOP_ITEMS`, `ShopSystem`, `purchase`), and placing stays "build mode" in code | A full rename of every shop/build identifier, like the materials rename | Keeps the change reviewable: the shop names are ~20 identifiers across the protocol, both sides and the tests, with no player-visible effect. Documented under Game Mechanics → Shop; a follow-up can rename them if wanted |
| Fabricator menu, Build on `B` (revised; both menus merged into the Build menu 2026-10-03) | The menu component is `FabricatorMenu` (panel id `fabricator`), with no hotkey; placing is Build on `B` again | `FabricateMenu` on `E`, placing on `F` (previous, same day) | Follows the requested wording; `E` left unbound on purpose |
| Removing the switching cooldown | Deleted outright: `UPGRADE_SWITCH_COOLDOWN_MS`, the synced `Player.upgradeSwitchReadyAt`, the Inventory countdown; the Inventory now re-renders every 200 ms with its own timer to keep the Wings check current (the countdown hook used to do that) | Setting the constant to 0 | Less state and no dead code; client and server deploy together, so dropping a synced field is safe |
| Explorer rename | `CharacterId` `smuggler` → `explorer` everywhere (catalog, specs, e2e) | Display name only | Same reasoning as `mine` → `fabricator`: one name per thing; ids aren't stored anywhere that outlives a match |
| Inventory bar icons | Inline SVG React components (`ItemIcon`; since 2026-10-03 each upgrade is a small drawing, `UpgradeArt`, still tinted with its pickup color, and each structure a picture of its building, `StructureIcon`) using the pickup colors | Rendering Phaser graphics to images; reusing `drawPickup` on a small canvas | The bar is React/DOM, so SVG is crisp at any size, testable in jsdom, and needs no Phaser; the shapes are simple enough to keep in step by hand until art replaces both |
| Inventory bar visibility | A `showInventoryBar` state in `GameScreen`, on by default, toggled by `I`; not remembered across reloads | `localStorage` | Simplest for now; persisting it is easy if it's wanted |
| Pickup contents rolled on opening | The server rolls a pod's contents in `PickupSystem` when it's opened, for the opener's tier; state holds only positions | Rolling at generation and hiding the fields from clients (Colyseus `@view`/filters) | Tiers depend on scores at the moment of opening, so the roll has to happen then anyway; keeping contents out of state means nothing to leak, with no schema filtering |
| Spawn hex on the client | Synced `Player.spawnTileX/Y` (uint8), set when joining | Moving the spawn-line math to `shared/` and syncing the slot | Two small fields; the client doesn't need to know how spawn spots are chosen |
| Pod respawn bookkeeping | Server-only fields on the schema classes (`Pickup.cell`, `GameState.nextPodWaveAt`, `pendingPods`, `podsMade`) | A private map in `GameRoom` | `PickupSystem` only has `state`, like `Player.spawnSlot` and `Tile.claimedBefore`; waiting pods aren't synced, so clients can't see where the next ones will appear |
| Game codes are room ids | `this.roomId` set to a 4-character code in `onCreate`; join with `joinById` | A code→id lookup table or endpoint | Colyseus allows a custom room id at creation, so the code needs no mapping and no extra state |
| Game list over HTTP | `GET /games` from matchmaker metadata, polled every 3 s | Colyseus `LobbyRoom` (a realtime room that pushes listing changes) | Simplest thing that works: no extra socket for players who are just browsing; the metadata is the same either way, so switching later is easy |
| Client routing | A 40-line `utils/route.ts` on the History API | react-router | Four paths; no dependency needed |
| Map sizes | 64 / 80 / 96 hexes square | 64 / 96 / 128 | A 128-hex map's baked terrain and claim textures would take ~200 MB of graphics memory, too much for phones; 96 is 2.25× the area of Small. The terrain texture is tiled (`BASE_TILE_SIZE`) so no single texture passes 4,096 px |
| Shot-vs-mountain sampling | Each tick's travel is checked every `SHOT_TERRAIN_STEP` (10) world px | The midpoint and end only (previous) | At 600 px/s a shot straight down the screen moves ~50 world px a tick, enough to skip a mountain hex's thin tip between two samples; stepping at 10 px keeps the "no skipping corners" spec passing at any speed |
| Bots live in the server | A bot is a `Player` with no client. `BotSystem` writes its movement into `playerInputs` and acts through the same system functions the message handlers use (`CombatSystem.fire`, `StructureSystem.place`, `ShopSystem.purchase`, `UpgradeSystem.equip`) | Headless bot clients over WebSocket (like `tools/bots.js`); AI in the host's browser | No network or extra process, nothing a player has to keep running, and the server already holds the whole state. Going through the same functions means bots can't break a rule people are held to |
| Seats for bots | `maxClients = SPAWN_SLOTS − bots`, with `bots` in the listing metadata | Keep `maxClients` at 10 and refuse joins in `onAuth` | Colyseus's own `maxClients` setter already keeps the listing and the automatic lock right, so a game full with bots can't be joined and isn't listed, with no extra code |
| Bot navigation | A breadth-first search on the hex grid per decision, limited to the difficulty's `searchDepth`, with a whole-map search as the fallback | A*, flow fields, a precomputed navigation mesh | Maps are at most 9,216 hexes and each bot decides a few times a second. One BFS both finds the routes and scores every candidate hex, and it walks around terrain and enemy structures for free |
| Bot tuning tool | `tools/bot-sim.js`: the real systems on a virtual clock (`Date.now` replaced), no Colyseus | Tuning by playing; e2e-style matches over the network | A 5-minute match in ~2 s, repeatable by seed. It found the spawn-camping problem (see GAME_DESIGN) and a pause at every waypoint (bots now re-plan the tick they arrive) |
| Scene listeners detached when the game goes | `GameScene` detaches its room listeners on scene shutdown/destroy, and at once when `destroyPhaserGame` flags the game disposed in its registry (or never attaches, if flagged first) | Rely on Phaser's destroy events alone | A game destroyed while still booting (StrictMode's throwaway mount in dev) never runs its destroy, so its scene kept getting room changes and threw on every new shot or structure. The bug predates bots; they made it show at once |
| Private backpacks | Colyseus 0.16's `StateView`: `GameState.backpacks` is a `@view()` map, each client has a view, and a backpack is added only to its owner's; contents are server-only fields | Private messages (`client.send`) for drop and pick-up, re-sent on reconnect; syncing to everyone and hiding it in the client | Views handle the initial sync, patches, deletes and reconnects, and other clients are never sent the data at all (hiding it in the client would let a modified client see it). Verified in an encoder spec and over a real server in e2e before building on it |
| Respawn delay as a timestamp | `Player.respawnAt` (server ms, synced; 0 = in play), checked by each system, with `RespawnSystem.update` respawning when it passes | A separate `dead` flag plus a server timer; removing the player from the map | One synced number gives every client both "down" and the countdown (like `phase.endsAt`), and keeping the player in place leaves the camera where they fell |
| Terrain drawn in code | Mountains: one baked texture per mountain from `mountainModel` (a lit, faceted heightfield over its footprint), depth-sorted with entities. Water: extra detail baked into the existing base layer. The mountain pieces are synced once as `GameState.mountains` | Sprite images (none exist yet); drawing mountains into the base layer too | Per-mountain images are needed so mountains hide what's behind them; baking keeps the per-frame cost near zero (a `Graphics` re-runs its commands every frame, the lesson of the performance pass). The pieces are synced because they can't be derived from the terrain bytes |
| Base layer baked per tile | Each base tile bakes a Graphics of only the hexes that reach into it | One Graphics of the whole map drawn into every tile (previous) | With textured ground a hex takes ~15 draw commands; replaying the whole map into each of up to 6 tiles would have made loading several times slower |
| Color schemes as data | A `TerrainPalette` object per scheme, passed into the art functions; the server picks the id per match and syncs it | Swapping module constants; a client-side random pick | One code path draws every scheme, so a new one is just data. Picking on the server gives everyone in a game the same scheme |
| Structure types as data | `STRUCTURE_SPECS` in `shared/types.ts` holds name, description, cost, health, points and footprint size (7 or 3 hexes) per type, with `structurePoints(type, character)` for the Farmer's bonus and `tileCapFor(farms)`; a placed structure's hexes always come from `structureHexes` / `inStructure` (anchor, `rotation`, type) | One flat constant per number (`STRUCTURE_POINTS`, `STRUCTURE_COST`; previous); hard-coding the 7-hex footprint everywhere | Every type now differs in several numbers and the Guard Tower in shape, and a new type (the power plant's job, dorms) should be one table row. Routing every footprint question through one function removed ~10 copies of the 7-hex assumption |
| Per-player tile limit and Fabricator access as synced fields | `Player.tileCap` and `Player.hasFabricator`, set by `StructureSystem.refreshOwner` when a structure is placed or destroyed | The client counting farms and fabricators in `state.structures`; computing them on every claim or purchase | The React roster already re-renders from player fields; structures aren't in React state. One place changes them, and the claim and purchase checks read a plain number or recompute from structures |
| Guard Towers fire through `CombatSystem.spawnShot` | A tower is a shooter with an owner but no gun or ammo: `TowerSystem` finds a target and calls the same projectile spawn as players, so kills, teammates passing through and hit tests all behave as for a player | A separate turret projectile type; towers as invisible bot players | Reuses every hit rule; the owner's id on the shot gives kill credit and friendly-fire immunity for free |
| One Build menu, two tabs | `BuildMenu` holds the Structures tab itself and the old Fabricator list as `UpgradesPanel`; `GameScreen` has one `build` panel and a `menuTab` state, and the Upgrades tab degrades to Structures while `hasFabricator` is false | Keeping two popups with a hotkey each; a locked tab that is still selectable | Requested (2026-10-03). Deriving the shown tab in `BuildMenu` from `hasFabricator` means no effect or reset is needed when a Fabricator is lost, and it keeps the first Fabricator buyable from the same menu |
| Respawn flag synced to the client | `GameState.respawnWhereDied` is a synced boolean (it was server-only) | A server-only flag, with the client guessing from the player jumping | The client moves the spawn platform to the death spot only when players really respawn there, and needs to know the flag for that |
| Respawn grace as a synced timestamp | `Player.graceUntil` (server ms, synced), checked by combat, towers and bots, and used by the client to blink the player | A server-only timer plus a boolean flag; a client-side timer started on respawn | Like `respawnAt`: one number tells every system and every client, with no extra message. The client needs it to draw the blink |
| Guns as a game setting, not a server flag | `GameSettings.guns` (default off), chosen on Create game, synced as `GameSettingsState.guns` and listed in `GameListing` | A server flag like `PICKUPS_ENABLED` (built first, then replaced); a top-level synced boolean like `respawnWhereDied` | The point is to switch guns back on without restarting the server, and per game; the client already receives `settings` once at join (`GameContext.settings`), so menus hide guns with no new plumbing. A plain `joinOrCreate` (no settings) gets guns off. |
| Color picker as its own reusable component | `ColorPicker` takes the chosen color, a heading, an accessible label, how many players have each color and an `exclusive` flag; `TeamSelect` just maps lobby state onto it. Swatches are `role="radio"` buttons in a `radiogroup` inside a `dialog`, with roving arrow-key focus | A `<select>` restyled further; a native `<input type="color">`; a listbox/combobox popup | Browsers can't style a native `<select>` popup into a swatch grid. Radios fit "pick one of N" and give screen readers the checked state; the server still validates the pick (`LobbySystem.canTakeTeam`). |
| Structure art as math over a `Brush`, baked per type and owner color | Art modules draw through a small `Brush` interface (a Phaser Graphics satisfies it) using a shared oblique-projection kit, and `bakeStructure` renders each (type, team color[, tower hexes]) to one 180 × 182 texture shown as an `Image`; smoke is a separate emitter | One `Graphics` per structure drawn live (hundreds of polygons each, per structure); loading image files; Phaser objects inside the art functions | A map can hold dozens of structures and each drawing has hundreds of polygons: baking costs one image each. Drawing to an interface instead of Phaser lets the specs run every drawing with a recorder (determinism, bounds, team color), as `terrainArt` does for mountains. |
| Shared glow and pipe helpers for the 2078 look | `glowLine`, `glowDot` and `pipe` live in `structures/common.ts` and every type's art uses them for lights and pipework | Each module drawing its own lights | One halo-plus-core recipe keeps the glow the same across the four structures and makes the look one place to tune. |
| Structure icons as hand-built SVG, in the player's color | `StructureIcon` draws each building as a small SVG in the 24 × 24 box of `ItemIcon` (a hexagon-paneled dome with a clip path, a hub with a glowing bay, a tower, a plant with a stack), with a pad of hex tiles in the player's color (`teamColor`, a neutral gray without one): seven for the first three types, three for the tower, flat-top hexagons of radius 3.5 squashed by 0.55, each with a darker side below it and a bright outline, so the icons show the same footprint as the map pads; `ItemIcon`'s SVG has `flex-shrink: 0` so a long description can't squeeze it | Rendering the Phaser art to images for the menus; keeping the colored slabs | The map art is baked from Phaser Graphics and can't be reused in DOM menus without a render step; at 36–38 px a dozen hand-placed shapes read well. The `STRUCTURE_COLORS` table and its default are gone. The menu text columns jumped between rows before the `flex-shrink` fix because icons were squeezed to different widths. |
| One shared hex pad for every structure | `drawHexPad(c, centers, teamColor, seed)` draws the pad for any set of hexes; the tower passes its three, the others `SEVEN_HEX_CENTERS` | A concrete pad per type in the type's own shape (a circle, a rectangle) | The pad is the footprint's own shape, so it needs no per-type shape and shows exactly what must be owned. The concrete `drawPad`, `PAD_TOP_COLOR` and the farm's pad radius are gone. |
| Weapon icons in their own component; pictures on every Upgrades row | `WeaponIcon` draws the Blaster, Ion Cannon and ammo pack as SVG in the standard 24 × 24 box; `ItemIcon` takes `kind: 'weapon'`; `UpgradesPanel` shows `ItemIcon` (36 px, like the structure rows) beside each shop item: a weapon's own picture or its upgrade's. `isWeaponId` / `WeaponId` live in `weaponIds.ts` | Putting weapon art in `ItemIcon.tsx` beside `UpgradeArt`; no icons for weapons | A component file that also exports a helper breaks fast refresh (ESLint's `react-refresh/only-export-components`), so the helper has its own file. A new icon kind keeps one place (`ItemIcon`) the menus draw pictures from. |
