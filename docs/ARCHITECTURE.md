# Sector 42 — Architecture

> A real-time multiplayer territory-claiming game with PvP shooting and destructible structures. Inspired by hexar.io. Up to 8–10 players per match, tile-based map, timed game phases.

---

## Start here

_For a new session or contributor. Last updated 2026-09-26 — run `git log` for anything newer._

**What this is.** Sector 42: a real-time multiplayer territory-claiming game (hexar.io-style) with PvP shooting, destructible structures and a shop, 8–10 players per match on an isometric hex map. The **server is authoritative**: clients send inputs, the server simulates at 20 Hz and syncs state. Server: Node + TypeScript + Colyseus 0.16.5. Client: React 19 + Phaser 4, built with Vite.

**Read in this order.** `README.md` (run, build, lint, controls) → this section → only the sections of this doc you need (it's ~1,550 lines; search by heading) → the **Decisions Log** at the end for *why* things are the way they are. Hosting is planned separately in `docs/HOSTING.md`.

| If you're working on… | Read |
|---|---|
| The protocol, messages, state schema | Networking Layer, Game State Schema |
| Game rules (phases, lobby, characters, teams, movement, shooting, score, shop, claiming) | Game Mechanics |
| The hex map, iso projection, coordinate spaces | Game Mechanics → *Map — hex grid and coordinate spaces* |
| Rooms, closing, reconnection, notices | Room Lifecycle, Reconnection System |
| Collisions, structures | Collision Detection, Destructible Structures |
| Client screens (lobby, HUD, shop UI, results) | Client — React Shell |
| Rendering, input, smoothing, performance | Client — Phaser Game, Testing → *Performance pass* |
| Testing and verification | Testing Multiplayer Locally, and `tools/README.md` |

**Verify after changes.** Server changes: `cd server && npm run build && npm run lint`, then `node tools/check-rules.js`, `node tools/check-collisions.js`, `node tools/e2e.js` (they run against the compiled server; `tools/README.md` explains each). Client changes: `cd client && npx tsc -b && npx eslint src`, then look at it in a browser — nothing under `tools/` covers rendering. `PHASE_TIME_SCALE=0.05` on the server shrinks every phase so a whole match runs in seconds.

**Kept in sync by hand** (there is no shared package). Change both sides together:
- `server/src/types/shared.ts` ⇄ `client/src/types/shared.ts` — messages, events and the **shop catalog** (`SHOP_ITEMS`). Checked automatically by `tools/check-rules.js`.
- `server/src/hex.ts` ⇄ `client/src/game/hex.ts` — shared hex math, including the structure footprint and hexagon (the server-only `structureContact` collision code is not copied; the client adds the iso projection). The shared part is also checked by `tools/check-rules.js`.
- `SCREEN_Y_SCALE` (server constants) = `ISO_SQUASH` (client constants); `HEX_SIZE` and `PLAYER_RADIUS` mirror across the two constants files.
- `client/src/types/gameState.ts` mirrors the server's `GameState` schema.
- Projectile velocity: `CombatSystem` ⇄ the client's `projectileWorldVelocity`.
- The lobby catalogs (`TEAMS`, `CHARACTERS`, structure/gun/upgrade names) live in `types/shared.ts`, so they're covered by the first bullet.

**Gotchas learned the hard way.**
- Pin all four Colyseus packages exactly and keep `useDefineForClassFields: false` in `server/tsconfig.json`; a client/server version mismatch or a missing flag shows up only when a real client joins (see Tech Stack).
- Node 20.19+/22.13+/24+ is required; the shell default may be too old.
- `npm run dev` on the server restarts on any file change and **drops every room**.
- Test on private ports (server `PORT=2599`, client `VITE_SERVER_URL=ws://localhost:2599 npx vite --port 5199`) and don't touch 2567/5173 — the developer often has their own dev server running. The browser test pane is throttled and its screenshots lag; techniques for working around that are in the Testing section.

**Working agreements** (also in `CLAUDE.md`): the developer runs all git commands themselves (ask them to commit); 4-space indentation; update this doc (and the README for user-facing changes) in the same change, including a Decisions Log row for design choices.

**Current state.** Playable end to end: ready-up lobby (pick a team color and one of 6 characters) → 3 s countdown → 5 min play → results screen, with hex movement, claiming (and the radius-doubling Expander), shooting (with a gun), structures placed from each character's starting inventory, teammates (no friendly fire), score, credits, an ammo/Basic gun/Expander shop, disconnect/reconnect with notices, and a results screen. See *Current Status & Known Issues* for the verified list and open bugs. **Temporary or placeholder** (see Planned Features #2, #3, #9): the character stats are first-pass values; the four structure types behave identically; there's no way to get more structures than you start with; "coming soon" shop items are mock rows; `STRUCTURE_POINTS` is one flat value; the results screen is basic; team play is allies-only (no pooling, no team win).

**Suggested next steps** (a proposal from the planning notes, not a commitment — confirm priorities with the developer):
1. Give structure types real behavior and values, and sell structures, better guns and armor in the shop (Planned Features #3, #9). Decide an ammo cap and balance the Expander and character kits.
2. Team follow-ups (Planned Features #2): pooling tiles/credits, a team win condition, team-size balancing. Per-character art (#7).
3. Spawn positions: a line on the right side of the map, "going west" (Current Status → Open questions).
4. Real art and sprites; decide whether terrain is gameplay or decoration (Planned Features #7).
5. Server-side fire-rate limit; client-side prediction (#8); off-screen player indicators.
6. Unit tests with Vitest — port `tools/`.
7. Hosting on AWS per `docs/HOSTING.md`.
8. Unresolved: a ~19 fps report on the developer's machine. Ask for the backtick readout (fps, ms/frame, renderer) — see Known Issues.

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
│  │  MobileJoystick, Build button            │   │
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
├── server/                         # Node.js + Colyseus server
│   ├── src/
│   │   ├── index.ts                # Entry point — Colyseus Server + Express health route
│   │   ├── constants.ts            # Shared tunables (tick rate, hex size, speed/accel, damage, etc.)
│   │   ├── hex.ts                  # Flat-top hex grid math: pixel<->hex, hex centers, map bounds
│   │   ├── teams.ts                # areAllies(): same player or same team

│   │   ├── rooms/
│   │   │   └── GameRoom.ts         # Colyseus room — lifecycle, message handlers, tick loop
│   │   ├── state/
│   │   │   └── GameState.ts        # Colyseus schema definitions
│   │   ├── systems/
│   │   │   ├── Broadcast.ts        # Shared callback type systems use to emit discrete events
│   │   │   ├── LobbySystem.ts      # Team/character/ready picks, default team, ready -> countdown -> playing
│   │   │   ├── CharacterSystem.ts  # Applies a character's starting kit (gun, ammo, credits, structures, upgrades)
│   │   │   ├── MovementSystem.ts   # Eases velocity toward the input direction (accel-limited), drops stale input, slides around enemy structures, boost
│   │   │   ├── CollisionSystem.ts  # Tile-claiming collision, batched tilesClaimed broadcast
│   │   │   ├── CombatSystem.ts     # Projectile movement, hit detection, respawn-on-death
│   │   │   ├── StructureSystem.ts  # Structure damage/destruction
│   │   │   ├── PhaseSystem.ts      # Phase transitions; times playing -> results
│   │   │   ├── EconomySystem.ts    # Credit payouts (1/tile/10s)
│   │   │   ├── ScoreSystem.ts      # Recomputes each player's score: tiles + kills x 50 + structures
│   │   │   └── ShopSystem.ts       # Validates and applies purchases (ammo pack, Basic gun, Expander)
│   │   └── types/
│   │       └── shared.ts           # Shared message types (copy into client too)
│   ├── tsconfig.json
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
│   │   │   ├── shared.ts           # Hand-copy of server/src/types/shared.ts
│   │   │   └── gameState.ts        # Plain interfaces typing the decoded room.state shape
│   │   ├── utils/
│   │   │   ├── device.ts           # isTouchDevice() — picks keyboard vs. virtual-joystick input
│   │   │   ├── score.ts            # scoreFor(player) — reads the server-computed Player.score
│   │   │   ├── usePhaseCountdown.ts # Hook: whole seconds left in the current phase
│   │   │   └── results.ts          # rankScores() (shared ranks for ties) + scoresFromPlayers() fallback
│   │   ├── components/
│   │   │   ├── HUD.tsx             # Own player's health/gun/ammo/tiles/credits/structures/upgrades + phase countdown (top left)
│   │   │   ├── ScoreBadge.tsx      # Always-visible own score (top center)
│   │   │   ├── BuyMenu.tsx         # Shop popup: the SHOP_ITEMS catalog grouped by category (weapons, upgrades, structures)
│   │   │   ├── Leaderboard.tsx     # Popup listing all players by score; toggled from GameScreen
│   │   │   ├── MobileJoystick.tsx  # Drag-based virtual joystick (touch input)
│   │   │   └── FireButton.tsx      # Hold-to-fire button (touch, during the match only)
│   │   ├── screens/
│   │   │   ├── LobbyScreen.tsx     # Player list with team/character/Ready, countdown, your character's kit
│   │   │   ├── GameScreen.tsx      # Hosts the Phaser canvas + HUD/score/shop/leaderboard/joystick/fire/build overlays
│   │   │   └── ResultsScreen.tsx   # Final standings + Play again / Main menu (stays up after the room closes)
│   │   └── game/
│   │       ├── PhaserGame.ts       # Phaser.Game config and init
│   │       ├── constants.ts        # Client render/smoothing/iso constants; hex/entity sizes mirror server/src/constants.ts
│   │       ├── hex.ts              # Hand-copy of server/src/hex.ts + isometric project()/unproject()/hexCorners()
│   │       └── scenes/
│   │           └── GameScene.ts    # Iso hex terrain, entities, smoothing, mouse-aim/joystick input — see Client — Phaser Game
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── eslint.config.js            # ESLint 10 flat config (browser globals + React)
│   ├── .prettierrc.json
│   ├── .prettierignore
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md             # This document
│   └── HOSTING.md                  # AWS hosting plan (Amplify client, Lightsail server, Caddy)
│
├── tools/                          # Verification scripts (plain Node; see tools/README.md)
│   ├── check-rules.js              # Game rules against the compiled server: hex, movement, phases, score, shop, claiming
│   ├── check-collisions.js         # Structure sliding sweep, projectile speed and tunneling
│   ├── e2e.js                      # Real clients vs. its own throwaway server: lifecycle, closing, reconnect, shop, edges
│   ├── bots.js                     # Load bots for profiling a browser client
│   └── lib.js                      # Shared helpers
│
├── README.md                       # How to install, run, build, lint; controls; troubleshooting
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
// be in the player's structureInventory; one is used up. Only on a tile you own.
{ type: "placeStructure", tileX: number, tileY: number, structureType: StructureType, seq: number }

// Lobby (the `lobby` and `countdown` phases only). Team and character changes are refused while
// the player is ready. There is no "start game" message: the match starts itself once every
// connected player is ready (see Game Phases).
{ type: "selectTeam", teamId: TeamId }             // "red" | "blue" | ... (TEAMS)
{ type: "selectCharacter", characterId: CharacterId } // "farmer" | "miner" | ... (CHARACTERS)
{ type: "setReady", ready: boolean }
{ type: "setName", name: string }                   // 2–25 characters; allowed while ready

// Join options (colyseus joinOrCreate('GameRoom', options)); not sent on a reconnect.
{ name?: string }  // the player's saved name (localStorage); falls back to "Player N" if missing/invalid

// Buy an item (allowed during `playing` only). itemId is a ShopItemId: "basicGun", "bigGun", "ammo",
// "boost", "armor", "expander", "farm", "mine", "fort" or "power" (see SHOP_ITEMS); the
// server checks credits, phase and (for one-per-player items) ownership. See Shop below.
{ type: "purchase", itemId: ShopItemId }

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

This is the actual, verified-working implementation — not a sketch. Per-player transient state (last input, a projectile-id counter) lives as private fields on the room rather than in the synced schema, since clients don't need to see it.

```typescript
import { Room, Client } from 'colyseus';
import { GameState, Player, Tile, Projectile, Structure } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { LobbySystem } from '../systems/LobbySystem';
import { CharacterSystem } from '../systems/CharacterSystem';
import type { Broadcast } from '../systems/Broadcast';
import { hexIndex, isValidHex, mapPixelSize } from '../hex';
import { TICK_RATE, RECONNECT_WINDOW_SECONDS, CREDIT_PAYOUT_INTERVAL_MS } from '../constants';
import type {
  InputMessage,
  ShootMessage,
  PlaceStructureMessage,
  InputAckEvent,
  SelectTeamMessage,
  SelectCharacterMessage,
  SetReadyMessage,
} from '../types/shared';
import { isStructureType } from '../types/shared';

export class GameRoom extends Room<GameState> {
  maxClients = 10;

  // NOT `inputs` — that name is reserved by the base Room class.
  private playerInputs = new Map<string, PlayerInput>();
  private matchFinished = false;
  private closing = false;
  private nextProjectileId = 0;

  private readonly broadcastEvent: Broadcast = (type, payload) => this.broadcast(type, payload);

  onCreate(): void {
    const state = new GameState();
    for (let i = 0; i < state.mapWidth * state.mapHeight; i++) {
      state.tiles.push(new Tile());
    }
    state.nextPayoutAt = Date.now() + CREDIT_PAYOUT_INTERVAL_MS;
    this.setState(state);

    this.setSimulationInterval((dt) => this.tick(dt / 1000), 1000 / TICK_RATE);

    this.onMessage<InputMessage>('input', (client, msg) => this.handleInput(client, msg));
    this.onMessage<ShootMessage>('shoot', (client, msg) => this.handleShoot(client, msg));
    this.onMessage<PlaceStructureMessage>('placeStructure', (client, msg) =>
      this.handlePlaceStructure(client, msg)
    );
    // Lobby: each validated by LobbySystem (phase, not-ready lock, known ids).
    this.onMessage<SelectTeamMessage>('selectTeam', (client, msg) =>
      this.withPlayer(client, (p) => LobbySystem.selectTeam(this.state, p, msg?.teamId))
    );
    this.onMessage<SelectCharacterMessage>('selectCharacter', (client, msg) =>
      this.withPlayer(client, (p) => LobbySystem.selectCharacter(this.state, p, msg?.characterId))
    );
    this.onMessage<SetReadyMessage>('setReady', (client, msg) =>
      this.withPlayer(client, (p) => LobbySystem.setReady(this.state, p, msg?.ready))
    );
    // ... and 'purchase' -> ShopSystem (playing only)
  }

  onJoin(client: Client): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = `Player ${this.state.players.size + 1}`;
    // An empty team first, else the smallest; sets teamId and color together.
    LobbySystem.setTeam(player, LobbySystem.defaultTeam(this.state));
    // Joining mid-match: no lobby to pick in, so play the default character.
    if (this.state.phase.phase === 'playing') CharacterSystem.apply(player);
    const { width, height } = mapPixelSize(this.state.mapWidth, this.state.mapHeight);
    player.x = width / 2; // everyone spawns at map center for now — see Current Status (open question)
    player.y = height / 2;
    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    // No reconnect window once the match is over — let everyone go so the room can close.
    if (consented || this.state.phase.phase === 'results') {
      this.cleanupPlayer(client.sessionId);
      return;
    }

    try {
      // Freezes the player entity in place — tiles/structures retained —
      // while this client has a chance to reconnect.
      await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
      const reconnected = this.state.players.get(client.sessionId);
      if (reconnected) reconnected.connected = true;
    } catch {
      // Reconnection window expired.
      this.cleanupPlayer(client.sessionId);
    }
  }

  onDispose(): void {
    // No external resources to release yet.
  }

  private cleanupPlayer(sessionId: string): void {
    this.state.tiles.forEach((tile) => {
      if (tile.ownerId === sessionId) tile.ownerId = '';
    });
    this.state.players.delete(sessionId);
    this.playerInputs.delete(sessionId);
  }

  // Runs a lobby action for this client's player if they're here and connected.
  private withPlayer(client: Client, action: (player: Player) => void): void {
    const player = this.state.players.get(client.sessionId);
    if (player?.connected) action(player);
  }

  // When the match ends: lock the room (matchmaking stops sending newcomers into it) and close it
  // once the results period is over. It also closes as soon as the last player leaves.
  private closeFinishedMatch(): void {
    if (this.state.phase.phase !== 'results') return;
    if (!this.matchFinished) {
      this.matchFinished = true;
      this.lock();
      ScoreSystem.update(this.state); // snapshot must reflect the very last tick
      this.broadcast('gameOver', { scores: ScoreSystem.finalScores(this.state) });
    }
    if (!this.closing && Date.now() >= this.state.phase.endsAt) {
      this.closing = true;
      void this.disconnect();
    }
  }

  private tick(dt: number): void {
    LobbySystem.update(this.state, this.broadcastEvent); // ready -> countdown -> playing
    MovementSystem.update(this.state, this.playerInputs, dt);
    CollisionSystem.update(this.state, this.broadcastEvent);
    CombatSystem.update(this.state, dt, this.broadcastEvent);
    PhaseSystem.update(this.state, this.broadcastEvent);
    this.closeFinishedMatch();
    EconomySystem.update(this.state);
    ScoreSystem.update(this.state);
  }

  private handleInput(client: Client, msg: InputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected) return;

    // Sanitize (finite numbers only) and clamp so a buggy/malicious client can't
    // move faster than PLAYER_SPEED — MovementSystem also caps the vector length at 1.
    const clampAxis = (value: unknown): number =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    const dir = { x: clampAxis(msg.dir?.x), y: clampAxis(msg.dir?.y) };
    // receivedAt lets MovementSystem drop input from a client that went silent (INPUT_STALE_MS).
    this.playerInputs.set(client.sessionId, { dir, seq: msg.seq, receivedAt: Date.now() });

    // Facing is cosmetic (other clients draw it), so just sanitize it.
    if (typeof msg.angle === 'number' && Number.isFinite(msg.angle)) player.angle = msg.angle;
    client.send('inputAck', { seq: msg.seq } satisfies InputAckEvent);
  }

  private handleShoot(client: Client, msg: ShootMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'playing') return;
    if (player.gun === '' || player.ammo <= 0) return; // unarmed players can't shoot

    player.ammo--;
    const projectile = new Projectile();
    projectile.id = `${client.sessionId}-${this.nextProjectileId++}`;
    projectile.ownerId = client.sessionId;
    projectile.x = player.x;
    projectile.y = player.y;
    projectile.angle = msg.angle;
    projectile.spawnedAt = Date.now();
    this.state.projectiles.set(projectile.id, projectile);
  }

  private handlePlaceStructure(client: Client, msg: PlaceStructureMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'playing') return;

    // Structures come out of the player's inventory (their character's starting kit, for now).
    if (!isStructureType(msg.structureType)) return;
    const slot = player.structureInventory.indexOf(msg.structureType);
    if (slot === -1) return;

    // Validate first — an out-of-range column would otherwise wrap onto another row.
    if (!isValidHex(msg.tileX, msg.tileY, this.state.mapWidth, this.state.mapHeight)) return;
    const tile = this.state.tiles[hexIndex(msg.tileX, msg.tileY, this.state.mapWidth)];
    if (!tile || tile.ownerId !== client.sessionId) return; // must own the tile

    let occupied = false;
    this.state.structures.forEach((s) => {
      if (s.tileX === msg.tileX && s.tileY === msg.tileY) occupied = true;
    });
    if (occupied) return;

    const structure = new Structure();
    structure.id = `struct-${msg.tileX}-${msg.tileY}`;
    structure.ownerId = client.sessionId;
    structure.tileX = msg.tileX;
    structure.tileY = msg.tileY;
    structure.type = msg.structureType;
    player.structureInventory.splice(slot, 1);
    this.state.structures.set(structure.id, structure);
  }
}
```

Systems are plain modules (not Room subclasses) so they're unit-testable without a live Room — see [Testing Multiplayer Locally](#testing-multiplayer-locally). GameRoom passes a `Broadcast` callback (`(type, payload) => this.broadcast(type, payload)`) into each system's `update()` so they can emit discrete events without needing a reference to the Room itself.

### Server Entry Point (`index.ts`)

```typescript
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './rooms/GameRoom';

// Default BUFFER_SIZE (8KB) is too small for a full-state sync of a 64x64
// tile map (4096 Tile schema instances plus players/structures/projectiles) —
// bump it so `getFullState` doesn't overflow when a client joins.
Encoder.BUFFER_SIZE = 128 * 1024; // 128 KB

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
  @type('number')  ammo: number = 0;             // ammo/credits/gun/inventory/upgrades: set from the character at match start
  @type('number')  tilesOwned: number = 0;
  @type('number')  kills: number = 0;
  @type('number')  score: number = 0;            // computed by ScoreSystem: tiles + kills x 50 + structures (no credits)
  @type('number')  credits: number = 0;          // see EconomySystem
  @type('number')  claimRadius: number = 32;     // world px (BASE_CLAIM_RADIUS); 80 once the Expander is owned
  @type('boolean') connected: boolean = true;
  @type('string')  color: string = '';           // always the team's color (TEAMS)
  @type('string')  teamId: string = '';          // a TeamId; same team = allies
  @type('string')  character: string = 'farmer'; // a CharacterId (DEFAULT_CHARACTER), picked in the lobby
  @type('boolean') ready: boolean = false;       // lobby only
  @type('string')  gun: string = '';             // a GunId, or '' = unarmed (can't shoot)
  @type(['string']) structureInventory = new ArraySchema<string>(); // StructureTypes left to place
  @type(['string']) upgrades = new ArraySchema<string>();           // UpgradeIds: 'boost' | 'armor' | 'expander'
}

export class Tile extends Schema {
  @type('string')  ownerId: string = '';    // empty string = unclaimed
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
  @type('string')  type: string = 'fort';   // a StructureType; all types behave the same for now
  @type('number')  health: number = 100;
  @type('number')  maxHealth: number = 100;
}

export class GamePhaseState extends Schema {
  @type('string')  phase: string = 'lobby';  // lobby | countdown | playing | results
  @type('number')  endsAt: number = 0;       // server timestamp ms
}

export class GameState extends Schema {
  @type({ map: Player })      players     = new MapSchema<Player>();
  @type({ map: Structure })   structures  = new MapSchema<Structure>();
  @type({ map: Projectile })  projectiles = new MapSchema<Projectile>();
  @type([Tile])               tiles       = new ArraySchema<Tile>(); // flat array, index = y*width+x
  @type(GamePhaseState)       phase       = new GamePhaseState();
  @type('number')             mapWidth: number  = 64;
  @type('number')             mapHeight: number = 64;
  @type('number')             nextPayoutAt: number = 0; // server timestamp ms, next EconomySystem payout
}
```

> Every field needs a default value (`= ''`, `= 0`, etc.) — `@colyseus/schema` requires initialized properties. `Projectile.spawnedAt` was added during implementation (not in the original draft) so `CombatSystem` can expire projectiles by age without keeping any spawn-time bookkeeping in module-level state, which would leak across concurrent rooms since systems are shared singletons.
>
> **These field initializers are also the reason the server's `tsconfig.json` needs `"useDefineForClassFields": false`** — see the note under [Server — Colyseus](#server--colyseus). Without it, TypeScript compiles `id: string = '';` to an `Object.defineProperty` call in the constructor, which overwrites the getter/setter `@type()` installs on the prototype and breaks change tracking silently (no compile error — it fails at encode time, on the first client join).

---

## Game Mechanics

### Map — hex grid and coordinate spaces

The map is **64 × 64 flat-top hexes** in an **odd-q offset** layout (odd columns sit half a hex lower), stored in the flat `tiles` array at index `row * mapWidth + col`. `tileX`/`tileY` in messages and events are hex **column/row**, not pixels. (`mapWidth`/`mapHeight` are column/row counts.)

There are two coordinate spaces, and mixing them up is the main way to introduce bugs here:

| Space | Used by | Definition |
|---|---|---|
| **World** | The server, all state (`x`, `y`, `vx`, `vy`, projectile positions), message payloads | Top-down, pixels, y down. Hex size `HEX_SIZE = 32` (circumradius); flat-to-flat height is `√3 × HEX_SIZE`. |
| **Scene** (screen) | Only the client's Phaser objects | World with `y` multiplied by `ISO_SQUASH` (0.6). This *is* the isometric look. |

The isometric view is **purely a render-time transform**. The server never sees it, so hex math, collision, and movement stay simple top-down. The client `project()`s everything it reads from the server before it touches a Phaser object, and `unproject()`s everything it reads from the pointer or joystick before sending it back (otherwise "aim at the cursor" and "walk where the stick points" come out wrong vertically).

`server/src/hex.ts` provides `hexCenter(col,row)`, `pixelToHex(x,y)` (axial cube-rounding, returns coords that may be off-map), `mapPixelSize(cols,rows)`, `isValidHex`, and `hexIndex`. `client/src/game/hex.ts` is a **hand-copy** of it plus the projection helpers — keep the shared part in sync by hand, like `types/shared.ts`. Verified 2026-09-20: `hexCenter`→`pixelToHex` round-trips exactly for all 4,096 tiles, including points offset toward each hex's edge.

Known limitation: the map's pixel bounds are a rectangle, but the hex edge is jagged, so a player can stand at a corner over *no* hex. Claiming simply ignores those spots.

**Map edge and camera (2026-09-20):** players are clamped `MAP_EDGE_MARGIN` (20 world px = one player radius) *inside* the map rectangle, so their whole body stays on the terrain instead of half hanging over the edge (verified by pushing a player hard into the left and top edges: closest position exactly 20). The client camera has **no bounds** — it always centers on the local player, even at the map's edge (empty space shows beyond the map), so you can never walk off the screen. (It used to be bounded to the map, which clipped the player against the screen edge there.) The camera also starts already centered on the player instead of panning in from the corner.

### Tile Claiming
- Players claim tiles by moving over unclaimed tiles or enemy tiles while the match is in the `playing` phase. Each tick a player claims **the hex they're standing on plus every hex whose center is within their `claimRadius`** of them (`CollisionSystem.claimTiles`). The base radius is `BASE_CLAIM_RADIUS = HEX_SIZE` (32 world px) — in the open that's just the hex under you (neighbor centers are ~55 px away), though standing near a hex edge can also claim the neighbor. The **Expander** raises it to `EXPANDER_CLAIM_RADIUS` = 4 × `PLAYER_RADIUS` = 80 px (it was 64 px when the player radius was 16), which claims 7 hexes when centered on one (own + 6 neighbors) and up to 9 depending on position; radius claiming steals enemy tiles exactly like walking over them does.
- **Teammates never take each other's tiles** (2026-09-26): a hex owned by a teammate is skipped, so allies expand around each other rather than stealing back and forth. Enemy tiles are taken as before.
- **A hex in an enemy structure's footprint can't be claimed** — the structure protects all 7 of its hexes (`isProtectedFrom`; a teammate's structure doesn't block you, but its tile is a teammate's anyway). Without this rule a large claim radius would routinely flip tiles out from under structures, breaking "you own the tile your structure is on"; the owner can still claim it, and anyone can still shoot the structure down.
- Verified 2026-09-20: the search window matches a brute-force scan of every hex exactly (1,200 random positions incl. map edges, 0 mismatches; at 80 px the Expander claims 2–9 hexes per tick depending on position — 1–7 at the earlier 64 px); a base-radius player at a hex center claims 1, an Expander owner claims 7 when centered on a hex; stolen tiles keep both players' `tilesOwned` consistent with the tile array.
- Tile ownership stored as `ownerId` string in the flat `tiles` array
- On claim: update tile, increment player's `tilesOwned`, decrement the previous owner's if any
- `CollisionSystem` batches every tile claimed in a tick into a single `tilesClaimed` broadcast rather than one broadcast per tile
- Contested tiles (two players attempt same tile in same tick): resolved by iteration order over `state.players`, which is insertion order (join order) — **not** yet resolved by input `seq` as originally planned; revisit if this matters for fairness at 8-10 concurrent players

### Game Phases

| Phase | Description | Duration |
|---|---|---|
| `lobby` | Players join and pick a team, a character, and Ready (see [Lobby, characters and teams](#lobby-characters-and-teams)) | Until every connected player is ready |
| `countdown` | Everyone is ready. Still the lobby screen, showing "Starting in 3…"; nobody moves. **Cancelled back to `lobby`** if anyone un-readies or a new (unready) player joins | 3s (`COUNTDOWN_DURATION_MS`) |
| `playing` | The whole match: claim tiles, shoot, build, earn credits, shop — all at once | 5 minutes (`MATCH_DURATION_MS`) |
| `results` | Match over. The room is **locked** (matchmaking stops sending newcomers into it) and closes when this timer ends, or immediately if the last player leaves | 60s (`RESULTS_DURATION_MS`) |

History: `claiming` (90s) and `combat` (120s) were merged into `playing` on 2026-09-20; a 30s `buying` phase was then added between the lobby and play, and **removed on 2026-09-26** along with the host's `startGame` (and the temporary `endBuying`) when the ready-up lobby replaced them — shopping now happens during play only.

**Dev/testing time scale:** set the environment variable `PHASE_TIME_SCALE` (e.g. `0.02`) on the server to shrink every phase duration (the countdown included), so a whole match runs in seconds. It's only read in `server/src/constants.ts` and is unset normally.

- Server owns all timers. `endsAt` is a server epoch timestamp (ms); client uses this for display countdown and corrects any local drift.
- `LobbySystem.update` (first in the tick) owns `lobby` ⇄ `countdown` → `playing`: lobby → countdown once `everyoneReady` (every *connected* player is ready, and there's at least one), countdown → lobby as soon as that stops being true, countdown → playing when its timer runs out — at which point every player gets their character's starting kit (`CharacterSystem.apply`). `PhaseSystem.update` only times `playing` → `results`.
- There is **no host** any more: nobody has to press Start, so nobody needs the role. (The old `hostId`/`reassignHostIfNeeded` handover logic was removed with it.)
- Phase transitions broadcast a `phaseChanged` message with the new phase and `endsAt` (including a cancelled countdown going back to `lobby`, with `endsAt: 0`).

### Lobby, characters and teams

Implemented 2026-09-26. Everything below is validated server-side in `LobbySystem`; the client's locked controls are a convenience.

- **Messages** (lobby and countdown phases only): `selectTeam { teamId }`, `selectCharacter { characterId }`, `setReady { ready }`. Unknown ids and non-boolean `ready` are ignored. **Team and character are locked while you're ready** — un-ready to change them — so what everyone saw when they readied is what starts.
- **Names** (added 2026-09-26): `normalizePlayerName` (shared) collapses whitespace runs to one space, strips control characters and trims, then requires **2–25 characters** counted as people count them (an emoji is one; `nameLength` uses code points). Anything else is allowed. The client sends its saved name as a join option, and `setName` renames in the lobby (not locked by being ready — it changes nothing that matters). **Names are unique:** if another player already has the name (ignoring case), the server gives you the first free `name (1)`, `name (2)`, … — shortening the name if needed so it still fits in 25 (`LobbySystem.uniqueName`). This also fixed the old duplicate `Player N` names after someone left. Invalid names are ignored; renaming is refused once the match starts.
- **Disconnected players don't hold the lobby up** (they're left out of `everyoneReady`). If they reconnect during the match they play whatever they'd picked.
- **Joining mid-match** (the room is only locked in `results`): the newcomer plays the default character (Farmer) with its kit applied immediately.

**Teams are colors.** `TEAMS` (in `types/shared.ts`, mirrored) has 8: red, blue, green, yellow, purple, teal, orange, gray. `Player.teamId` holds one and `Player.color` is always that team's color, so everything that already drew in the player's color (tiles, body, structures, claim ring) shows the team with no rendering changes. A newcomer gets the first team nobody is on yet, else the smallest (`LobbySystem.defaultTeam`), so by default everyone is on their own team — a free-for-all — until players pick the same color. Anyone can join any team; there's no size limit or balancing.

**What being teammates means** (`areAllies` in `server/src/teams.ts`: same player, or the same non-empty `teamId`; a player who left the room is nobody's ally):
- No friendly fire: shots pass through teammates and teammates' structures (`CombatSystem`).
- Teammates' structures aren't solid to you (`MovementSystem`), like your own.
- You don't take a teammate's tiles (`CollisionSystem.claimTiles`).
- **Tiles, credits and score stay per player.** The results screen adds a team table (sum of members' scores) when at least one team has two or more players. Pooled team tiles/credits and a team win condition are still open (Planned Features #2).

**Characters** (`CHARACTERS` in `types/shared.ts`, mirrored; first-pass values, expected to change). Picked in the lobby (default Farmer); the kit replaces whatever the player had when the countdown finishes:

| Character | Gun | Ammo | Credits | Structures | Upgrades |
|---|---|---|---|---|---|
| Farmer | none | 0 | 50 | farm | — |
| Miner | none | 0 | 50 | mine | — |
| Builder | none | 0 | 50 | fort | — |
| Robot | none | 0 | 50 | — | boost (top speed × `BOOST_SPEED_MULTIPLIER` = 1.25) |
| Scientist | none | 0 | 50 | power plant | — |
| Smuggler | basic | 15 | 15 | — | — |

- **Structure inventory:** `Player.structureInventory` lists the structures you can still place, one entry each. `placeStructure` names a `structureType` from it and uses one up; with an empty inventory you can't build (until the shop sells structures). `Structure.type` records which one was placed. All four types (farm, mine, fort, power plant) **behave identically for now** — same health, same 25 points — and differ only in color (see [Structures: footprint and shape](#structures-footprint-and-shape)).

### Structures: footprint and shape

Changed 2026-09-26 from one hex to seven.
- **Footprint:** a structure is placed on a center hex and occupies it plus its 6 neighbors (`structureFootprint` / `hexNeighbors` in the shared part of `hex.ts`). **Placement rule** (`StructureSystem.canPlace`, mirrored by the client's build preview): all 7 hexes must be on the map (so nothing at the edge), owned by the builder (a teammate's hexes don't count), and not part of another structure's footprint. Footprints may touch.
- **Shape** (revised 2026-09-26, same day): the solid, drawn shape is a **flat-top hexagon (like the tiles) with twice a tile's radius** (`STRUCTURE_RADIUS` = 2 × `HEX_SIZE` = 64 px; `STRUCTURE_CORNER_OFFSETS`). It's the largest flat-top hexagon that fits inside the footprint: each corner lands exactly on a notch where two outer hexes meet, and its edges cut straight across the outer hexes (area = 4 hexes). So it **never reaches outside its footprint, and structures never overlap** (`tools/check-rules.js` samples the hexagon against the footprint and tests every nearby pair). The first version was the ≈19.1°-turned hexagon with exactly the 7 hexes' area (√7 × `HEX_SIZE` ≈ 85 px); this one is 2/√7 ≈ 76% of its size, as requested ("~75%, flat top").
- **What the shape is used for:** movement collision (`structureContact`, the old single-hex `hexEdgeContact` generalized to any convex shape — same sliding and walk-out behavior, re-verified with 792 approaches), projectile hits (inside the hexagon), and drawing. The footprint (hexes) is used for placement and claim protection.
- **Look (placeholder until art):** a raised slab (`STRUCTURE_HEIGHT` 14 screen px). The **top face is the type's color** (`STRUCTURE_COLORS` in `client/src/game/constants.ts`: farm pale lime `#c5d86d`, mine dark brown `#6d4c41`, fort sandstone `#b0a18a`, power plant pale cyan `#80deea`, chosen muted so they don't read as team colors). The **sides and a 3 px border are the owner's team color**, so the type reads from the top and the team from the edge. It's one `Graphics` per structure, drawn once. It sorts by its northmost corner, so its owner (or a teammate) standing on it draws on top instead of being hidden (they were, when it sorted by its center).
- **Build preview:** in build mode the hover outline becomes the structure hexagon, **yellow if you can build there, red if not**. A click on a red spot does nothing and stays in build mode; on touch (no hover) a refused tap shows the red outline for 1.2 s. The Build button's armed label is "Pick a spot — all 7 hexes must be yours". **Build mode has no timeout** (the old 5 s auto-disarm was removed 2026-09-26): it stays on until you build, press **B** or the Build button again, or press **Esc**. **B** toggles it on desktop.
- Verified 2026-09-26: `check-rules.js` (neighbors, flat-top 2-radius shape, corners on grid vertices, inside the footprint, no overlaps, every placement rule, all 7 hexes protected, hits inside/outside), `check-collisions.js`, `e2e.js` (a Farmer walks a footprint and builds over the wire), and in the browser (bots built a farm, mine and fort; the red/yellow preview; building a power plant through the UI, score +25).
- **Guns:** `Player.gun` is `''` (unarmed) or a `GunId`: `'basic'` (50 damage per hit) or `'big'` (100). Unarmed players can't shoot (the server ignores `shoot`; the client doesn't send it and hides the mobile fire button). Both guns are sold in the shop (see [Shop](#shop)). Ammo can be bought without a gun.
- **Upgrades:** `Player.upgrades` lists `UpgradeId`s — `'boost'` (+25% top speed), `'armor'` (max health 200 instead of 100) and `'expander'` (bigger claim radius; recorded as an upgrade since 2026-09-26, it used to be inferred from `claimRadius`). `CharacterSystem.applyUpgradeEffects` derives `maxHealth` and `claimRadius` from the list whenever it changes; the boost is read directly by `MovementSystem`.
- **Art per character** is planned (Planned Features #7); for now everyone is the same circle in their team color.

### Movement

Movement is continuous, at **any angle**, and eased rather than snapping between headings.

- **Server (`MovementSystem`)**: movement only happens during `playing` (velocities are zeroed in every other phase). Each tick, the target velocity is `dir × PLAYER_SPEED` (× `BOOST_SPEED_MULTIPLIER` = 1.25 for players with the `boost` upgrade, e.g. the Robot; acceleration is unchanged), where `dir`'s length is measured **on-screen** — `hypot(dir.x, dir.y × SCREEN_Y_SCALE)`, clamped to ≤ 1 with a small deadzone; magnitude scales speed, so an analog joystick can walk slowly. `SCREEN_Y_SCALE` (0.6, `server/src/constants.ts`) must equal the client's `ISO_SQUASH`. The effect: a full push straight up the screen is a world vector of length 1/0.6 ≈ 1.67 (≈ 333 world px/s) yet looks exactly as fast as one sideways (200 px/s), and the cap is an ellipse in world space, so a cheating client can't exceed top speed in any direction. `GameRoom.handleInput` accordingly allows world-y up to `1 / SCREEN_Y_SCALE`. Set `SCREEN_Y_SCALE = 1` for plain world-uniform speed. This (and projectile speed in `CombatSystem`) is where the server knows about the view's tilt — a deliberate tradeoff: it means the same on-screen speed for everyone at the cost of moving farther in world units vertically (crossing the map top-to-bottom, 3,575 world px, takes about 10.7s vs 15.4s left-to-right). Actual velocity moves toward the target by at most `PLAYER_ACCEL × dt` (1200 px/s²) — the *same* limit applies when speeding up, stopping, and turning, so a full reverse takes a fraction of a second instead of flipping instantly. Then `position += velocity × dt`, clamped to the map rectangle (velocity is zeroed on the axis that hit the edge). `vx`/`vy` are synced so clients can extrapolate. Verified with a script: ramp to 200 px/s in ~4 ticks, headings ease from 45° to −73° over ~5 ticks, and a stop takes ~4 ticks.
- **Input is a world-space vector plus a facing angle**, so the server is agnostic to how the client derived it. The server keeps only the *latest* input per player (overwrite, not a queue).
- **Stale input is dropped.** If no input arrives for `INPUT_STALE_MS` (750ms) the player is treated as pressing nothing and coasts to a stop. Without this, a client that goes silent — a backgrounded browser tab pauses Phaser's loop, or the connection stalls — leaves the player running in their last direction indefinitely (found and fixed 2026-09-20). Clients therefore re-send at least every 250ms while active.
- **Right-click to move (desktop):** right-click the map to set a destination; the player walks there without holding a key, and a ring on the ground marks it. It eases off over the last `TARGET_SLOW_DISTANCE` (80 world px) so the player stops on the spot — measured 2026-09-20: a 300 px trip took 2.0 s, ramped to 200 px/s, stopped 9 px from the target with no overshoot. The target clears on arrival, or when there's no progress for `TARGET_STUCK_MS` (1.2 s — e.g. the spot is inside another player's structure or off the map), and **pressing any movement key (arrows or WASD) or using the joystick cancels it and hands control back**. Left click still shoots; the browser context menu is disabled on the canvas. Purely client-side: it just drives the same `input` vector the keys would, so the server is unchanged.
- **Desktop controls (client)**: `W`/`A`/`S`/`D` (or arrows) move in fixed **on-screen** directions — up, left, down, right, combined and normalized so diagonals aren't faster — and the mouse only *aims* and shoots. The alternative, `MOVE_RELATIVE_TO_AIM = true` in `client/src/game/constants.ts` ("forward" is toward the cursor, `A`/`D` strafe), was the first prototype's default and was dropped: the camera follows the player while the cursor stays fixed on screen, so the cursor's world position keeps running away as you approach it, and strafing orbits it — it plays like chasing the mouse. Pressing keys in screen space is also what the iso view suggests naturally. Speed is uniform in *screen* space (`UNIFORM_SCREEN_SPEED = true`, see the Server bullet above), so up/down feels as fast as sideways; set the flag to `false` for the physically-uniform-on-the-ground alternative, where straight up/down looks ~40% slower. **Mobile**: the joystick gives an on-screen vector that is `unproject`ed to world space, so the character moves where the stick points on screen; facing follows the movement direction.
- **Smoothness on the client**: see [Client — Phaser Game](#client--phaser-game) — rendered positions chase server state with frame-rate-independent smoothing plus a little velocity extrapolation. There is **no client-side prediction yet**, so your own input still takes about one round trip plus a server tick to show up (imperceptible on localhost, noticeable at 100ms+ latency). Prediction with reconciliation is the next step for latency hiding.

### PvP Shooting
- Client sends `shoot` message with an angle; server rejects it outside the `playing` phase, if the player has no gun (`Player.gun === ''`), or if they're out of `ammo`
- **No friendly fire:** projectiles pass through the shooter's teammates and their structures (see [Lobby, characters and teams](#lobby-characters-and-teams))
- Server spawns a `Projectile` in state at the shooter's current position, decrementing `ammo` by 1 — **there is currently no ammo regeneration or reload**, so a player can run out permanently within a match; add a regen tick or pickup mechanic before this ships
- `CombatSystem` advances all projectiles each tick, checks collision against players and structures, and removes projectiles on hit, out-of-bounds, or after `PROJECTILE_LIFETIME_MS` (tracked via `Projectile.spawnedAt`, not wall-clock elapsed time inferred from ticks)
- **Projectile speed is on-screen, like player movement.** A projectile's `speed` (400) is measured with world y scaled by `SCREEN_Y_SCALE`, so a shot fired up or down the screen moves ~667 world px/s vertically and looks exactly as fast as one fired sideways (400 world px/s). `CombatSystem` divides the heading `(cos, sin)` by its on-screen length `hypot(cos, sin × SCREEN_Y_SCALE)`; the client mirrors this in `projectileWorldVelocity` to extrapolate between ticks. Side effects: vertical shots travel farther in world units over their 2s lifetime (about 1,333 vs 800 px), and they cover ~33 world px per tick vs 20 sideways — see the swept hit test under [Collision Detection](#collision-detection).
- **Damage comes from the shooter's gun** (`GUN_DAMAGE` in `types/shared.ts`): basic 50, big 100. It's stamped on the projectile when fired (`Projectile.damage`), so it applies to players and structures alike. Players have `maxHealth` 100, or 200 with **Armor**: an unarmored player dies to two basic hits or one big hit; an armored one to four basic or two big. Respawns restore `maxHealth`. **They look different too** (client, 2026-09-26, told apart by the synced `Projectile.damage`): basic-gun shots are a small white bolt (0.7 × `PROJECTILE_RADIUS`), big-gun shots the original yellow bolt at 1.3× — see `BASIC_SHOT_*` / `BIG_SHOT_*` in `client/src/game/constants.ts`. Only the drawing differs; the hit radius is the same.
- On a killing blow, the shooter's `kills` increments and the target **respawns** (full health, repositioned to map center) rather than being eliminated — this is a territory-claiming game, not a deathmatch, so matches don't end early from PvP alone
- Server broadcasts `playerHit` on every hit (not just kills); client should use this to play a hit effect

### Score
`ScoreSystem` recomputes every player's `Player.score` each tick from current state (`server/src/constants.ts`):

`score = tilesOwned × TILE_POINTS (1) + kills × KILL_POINTS (50) + structuresOwned × STRUCTURE_POINTS (25)`

- **Credits are excluded** (they'll be spent, so counting them would make buying cost points).
- Score is *derived*, not accumulated: it drops when tiles or structures are lost, not only when gained. Kills are permanent (a kill is banked even if the victim later respawns).
- `STRUCTURE_POINTS` is a **placeholder**: `Structure` now has a `type` (farm, mine, fort, power plant — from the characters' kits), but every type is still worth the same 25. Per-type values come with real structure behavior.
- Colyseus syncs a field only when its value changes, so recomputing every tick costs nothing on the wire. The client's `scoreFor()` just reads `Player.score`.
- Verified with scripts (10 tiles + 2 kills + 2 structures + 9999 credits = 160; losing a structure → 135) and end to end with two clients (6 tiles → score 6; building a structure → +25).

### Shop
Buying works through one message, `purchase { itemId }`, handled by `GameRoom.handlePurchase` → `ShopSystem.purchase`. It is allowed in the `playing` phase only (there's no separate shopping phase since 2026-09-26), for connected players. The server re-validates everything (unknown ids, credits, ownership); the client's disabled buttons are just a convenience.

Rebuilt 2026-09-26 as a data-driven catalog: each `SHOP_ITEMS` entry has a `category` (the menu groups by it) and says what it gives — a `gun`, `ammo`, an `upgrade` or a `structure` — and `ShopSystem.purchase` just applies that. `ownsShopItem` (shared, so the server and the menu agree) says when buying would get you nothing: an upgrade you already have, or a gun that isn't better than yours.

| Category | Item | Cost | Effect |
|---|---|---|---|
| Weapons | **Basic gun** | **100** | Lets you shoot; 50 damage per hit. Refused if you already have any gun. (40 until 2026-09-26.) |
| Weapons | **Big gun** | **200** | 100 damage per hit. Replaces the basic gun; can be bought without it first. You can't go back to the basic gun. |
| Weapons | **Ammo pack** | **30** (1 per shot) | +30 ammo. Repeatable; **no ammo cap** yet. |
| Upgrades | **Speed boost** | **100** | +25% top speed (`BOOST_SPEED_MULTIPLIER`), like the Robot's. One per player (a Robot already has it). |
| Upgrades | **Armor** | **100** | Max health 100 → 200 (`ARMOR_MAX_HEALTH`), and +100 health right away (a hurt player keeps their damage but gains the headroom). One per player. |
| Upgrades | **Expander** | **100** | Claim radius becomes 80 world px (from 32; **4 × the player radius**), permanently — it survives respawns. One per player. The client draws a semi-transparent circle in the player's color on the ground at that radius, visible to everyone. |
| Structures | **Farm**, **Mine**, **Fort**, **Power plant** | **100 each** (`STRUCTURE_COST`) | One more of that type in your structure inventory. Buy as many as you can pay for. |

All upgrades are permanent for the match (they survive respawns).

- **Shared catalog:** the item list, prices and what each gives live in `SHOP_ITEMS` (plus `AMMO_PACK_SIZE`, `AMMO_CREDITS_PER_SHOT`, `STRUCTURE_COST`, `GUN_DAMAGE`, `ownsShopItem`) in `types/shared.ts`, a block that must stay **identical** in `server/src/types/shared.ts` and `client/src/types/shared.ts` (hand-copied, like the rest of that file). Server logic and the menu both read prices from it, so they can't disagree. `BASE_CLAIM_RADIUS`, `EXPANDER_CLAIM_RADIUS` and the health values are server constants; the client only sees the resulting `Player.claimRadius` / `maxHealth` (and mirrors the base radius to decide when to show the circle).
- **Starting budget:** set by the character (50 for most, 15 for the Smuggler). 50 buys one ammo pack; everything else (100+) takes a while of territory income (1 credit per hex every 10 s).
- **The circle** (`GameScene.updateClaimRing`): an ellipse of the claim-radius diameter, squashed by `ISO_SQUASH` like everything on the ground (160×96 scene px for 80 world px), filled with the player's color at `CLAIM_RING_FILL_ALPHA` and outlined at `CLAIM_RING_STROKE_ALPHA`, at depth −0.4 so it sits above the terrain but under every entity. It's created when the radius exceeds the base, resized if the radius changes, and destroyed with the player.
- Verified: unit script (affordability, ammo math, second Expander rejected, junk ids like `__proto__`/`toString`/`null` rejected with credits untouched); browser (buying ammo took credits 100 → 70 and ammo 30 → 60, and the Expander button disabled at 70; buying the Expander at 100 left "Owned", the ring appeared in the player's color at 128×77, and a short walk claimed a two-hex-wide swath).

### Economy (Credits)
- Every player with `tilesOwned > 0` earns 1 credit per owned tile, once every `CREDIT_PAYOUT_INTERVAL_MS` (10s)
- `EconomySystem` runs only during `playing` — no payouts in `lobby` (no tiles are ownable yet) or `results` (match is already decided)
- Credits are a spendable currency for the shop and are **not part of the score**. Starting credits come from the player's character (50, or 15 for the Smuggler; `STARTING_CREDITS` was removed 2026-09-26); they then earn more during play. See [Shop](#shop) for what they buy.
- Uses a wall-clock `GameState.nextPayoutAt` timestamp rather than counting ticks, so it stays correct if `TICK_RATE` ever changes — same pattern as `GamePhaseState.endsAt`
- No discrete broadcast event for a payout — `Player.credits` is a plain synced field, so clients see it update via the normal state delta, the same way `x`/`y`/`health` do
- Spending is the only sink: credits leave when a purchase succeeds (`ShopSystem.purchase`). Nothing else consumes them.

---

## Client — React Shell

### Networking layer — implemented and verified 2026-09-19

The client's networking code is built and has been exercised end-to-end against the live server (see the Tech Stack note): join, full-state decode, reactive state callbacks, `startGame`, `input`/`inputAck`, movement, and `tilesClaimed` all confirmed working. It's split into three pieces:

- **`src/types/shared.ts`** — hand-copied mirror of `server/src/types/shared.ts` (the client/server message contract). Keep both files in sync by hand; there's no shared package between the two yet.
- **`src/types/gameState.ts`** — plain TypeScript interfaces (`PlayerState`, `TileState`, `ProjectileState`, `StructureState`, `GameStateShape`, etc.) describing the shape of the decoded root state, typed as `ReadonlyMap`/`readonly T[]` rather than importing the server's schema classes. `colyseus.js` decodes `@colyseus/schema` state by **reflection** at connect time, so the client never needs the server's actual `Schema` subclasses — these interfaces exist purely for TypeScript, and the real decoded `MapSchema`/`ArraySchema` instances satisfy them structurally at runtime.
- **`src/net/GameConnection.ts`** — a thin wrapper around `colyseus.js`'s `Client`/`Room`: `connectToGame(handlers)` joins (or rejoins via a `sessionStorage`-persisted `reconnectionToken`) the `GameRoom` and wires up discrete server→client message handlers; `sendInput`/`sendShoot`/`sendPlaceStructure`/`sendStartGame` are typed send helpers; `leaveGame`/`clearReconnectionToken`/`isNormalClose` support a clean, consented leave. High-frequency gameplay state (positions, tile ownership) is **not** modeled as discrete messages — it's plain Colyseus state, read directly off `room.state` by the Phaser layer's render loop — see [Client — Phaser Game](#client--phaser-game).
- **`src/main.tsx` must wrap `<App />` in `<GameProvider>`.** `useGameConnection()` throws if there's no provider above it, and because `App` calls it on its very first render, omitting the wrapper produces a completely blank page (React unmounts the tree; the only trace is an uncaught `useGameConnection must be used within a GameProvider` in the console). This was the cause of the "dev server runs but no UI" report on 2026-09-20.
- **Wait for the first state before publishing the room.** `client.joinOrCreate()` resolves when the join handshake completes, but the server's initial full-state message is decoded a moment *after* that — so right after the promise resolves, `room.state.phase` is still `undefined`. `GameContext.connect()` therefore checks `room.state?.phase` and, if it's missing, awaits `room.onStateChange.once(...)` before calling `setRoom`/`setStatus('connected')` or reading any state. Consumers (lobby, `GameScreen`, HUD) can rely on `room.state` being fully populated whenever `status === 'connected'`. (Earlier smoke-test scripts worked only because they awaited a state change explicitly.)
- **`src/context/GameContext.tsx`** — a React context (`GameProvider` / `useGameConnection()`) that owns the connection lifecycle: `status` (`idle` / `connecting` / `connected` / `reconnecting` / `error`), the current `room`, `sessionId`, `phase`/`phaseEndsAt` (kept in React state via the `phaseChanged` message, since phase changes are low-frequency and worth a re-render), a `players` array kept in sync via `getStateCallbacks(room)` reactive `onAdd`/`onRemove`/`onChange` callbacks (also low-frequency — a HUD/lobby list, not a per-tick render), and `gameOver`. It automatically retries via the reconnection token on an unexpected drop (any `onLeave` code other than `1000`, the consented-leave code), with a fixed retry delay — not implemented yet: a max-attempts cutoff or backoff, worth adding before this ships. `connect()`/`leave()` are exposed for a lobby screen to call, and `input`/`shoot`/`placeStructure`/`startGame` are the typed action dispatchers.

### Screen routing — implemented 2026-09-20

`App.tsx` routes on connection `status` and room `phase` directly, rather than a separate `screen` enum a Colyseus-agnostic sketch might use — `phase` is already the authoritative source of truth for what should be on screen:

```typescript
// App.tsx (actual, simplified)
if (gameOver || (connected && phase === 'results')) return <ResultsScreen />;  // final standings
if (status !== 'connected') return <ConnectPrompt />;      // idle / connecting / reconnecting / error
if (phase === 'lobby' || phase === 'countdown') return <LobbyScreen />;
return <GameScreen />;                                       // playing
```

`GameScreen` (`src/screens/GameScreen.tsx`) hosts the Phaser canvas plus the HUD, leaderboard, mobile joystick, and build-mode button — see [Client — Phaser Game](#client--phaser-game) for how those pieces fit together. `ResultsScreen` and `LobbyScreen` are their own screens; only the connect prompt is still inline in `App.tsx`.

### Lobby screen

Built 2026-09-26 (`screens/LobbyScreen.tsx`; rules in [Lobby, characters and teams](#lobby-characters-and-teams)). A full-screen dark page in the results screen's style:
- **Player list:** one row per player in join order — color dot, name ("(disconnected)" if so), team, character, ready state. **Your row has the controls:** a **name field** (edit in place; sent on Enter or leaving the field, Esc cancels; red border and "2–25 characters" hint while invalid; 16px text so iOS Safari doesn't zoom in on focus; `enterKeyHint="done"`, `autoComplete="nickname"`), a Team `<select>` (the 8 team names, each with its current player count, left border in your color), a Character `<select>`, and a **Ready** toggle (yellow "Ready" → green "✓ Ready"; press again to cancel). Both selects are disabled while you're ready. Other rows are read-only ("✓ Ready" / "Not ready"). Below 560px wide each row wraps: name, then the two selects side by side, then a full-width Ready button.
- **Saved name:** `utils/playerName.ts` keeps the last name you set in `localStorage` (`sector42.playerName`; reads and writes are wrapped, so blocked storage just means no memory) and `GameContext` sends it with every fresh join, so it carries over from game to game and across page loads. The name you *typed* is saved, not the suffixed one, so you don't collect "(1) (1)" over time.
- **Selects are `appearance: none` with a drawn arrow:** Safari ignored the dark styling and drew its own glossy controls (reported 2026-09-26). They're a stopgap — see Planned Features #10.
- **Status line:** "Set your name, pick a team and a character, then press Ready." → "Waiting for N more players to get ready…" once you're ready → a large "Starting in 3…" during the countdown (`usePhaseCountdown` at a 100 ms tick so the first number isn't stale).
- **Your character card:** name, one-line description, and the starting kit (gun, ammo, credits, structures, upgrades) from `CHARACTERS`.
- A short note explains what teammates mean. Notices (disconnect/reconnect toasts) show here too.
- `GameContext` exposes `selectTeam`, `selectCharacter` and `setReady` (replacing `startGame`/`endBuying`), and its roster signature now includes team, character, ready, gun, inventory and upgrades. `structureInventory`/`upgrades` are `ArraySchema`s, whose item changes don't fire the player's `onChange`, so the context also subscribes to their `onAdd`/`onRemove`.
- Verified in the browser 2026-09-26 on private ports with two tabs: default teams, switching to a teammate's color (count shows "Red (2)"), picking the Smuggler updates the card, both Ready → "Starting in 3…" → the match, with each tab's HUD showing its own kit; the layout at 375px.

### Results screen

Built 2026-09-20 (`screens/ResultsScreen.tsx`). When the match ends the server broadcasts one `gameOver` message with the **final standings** (best first: score, then kills, then tiles — the tie-break order is a placeholder); `App` shows the results screen as soon as it arrives.
- **Content:** a headline ("You win!", "`<name>` wins!", or "Tie: A & B"), a **team table** (team, players, total score — only when some team had two or more players; `utils/results.ts`'s `teamTotals`), a table of rank / player (color dot, "(you)") / score / tiles / kills / structures with your row highlighted, a one-line score formula, the "room closes in Ns" countdown, and **Play again** / **Main menu** buttons.
- **Ties:** players with the same score share a rank, and every rank-1 player is a co-winner. There's no real tie-break yet.
- **Survives the room closing:** the standings live in `GameContext` (`gameOver`, plus `lastSessionId` so "(you)" still works) rather than the room, so the screen stays up after the room closes, switching its note to "This room has closed." Standings come from the server snapshot, so they don't change if someone leaves during the results period. If the snapshot ever didn't arrive, `App` falls back to `scoresFromPlayers(players)` while still connected (structure counts show as 0 in that fallback).
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

- **Isometric hex terrain**: two **baked `RenderTexture` layers** plus a small `Graphics` for the hover outline. (Both big layers were `Graphics` objects at first; a `Graphics` re-runs its entire command list every frame, so the 4,096-hex base cost **~53 ms of JS per frame — under 20 fps** — and made movement look jumpy. Baking dropped that to ~0.75 ms/frame. In Phaser 4 a `RenderTexture` needs `draw(...)` *then* `render()`, which `GameScene.bake` does.) (1) *Base* — every hex drawn once into its texture at scene create: cliff faces on the three lower edges (`HEX_DEPTH` px tall), then the top face and outline, tiles sorted back-to-front by center y so a nearer tile's top covers the face of the tile behind it. It never redraws. (2) *Claims* — the top face of each claimed hex tinted with its owner's color (`CLAIM_BLEND`) **and outlined with a darker shade of that fill** (`CLAIM_BORDER_DARKEN`/`CLAIM_BORDER_WIDTH`; the fill would otherwise paint over the base outline and merge same-colored hexes into a blob). This layer is split into **512×512-px chunk textures** (`CLAIM_CHUNK_SIZE`, 35 chunks, ≤215 hexes each; a hex straddling a chunk edge is drawn into both). `syncClaims()` compares each tile's owner with what was last drawn (`renderedOwners`), and re-bakes only the chunks containing a change (`rebakeChunk`), so the cost of a claim is bounded by one chunk however many hexes are claimed, and off-screen chunks are culled. It runs when a dirty flag is set (by `tilesClaimed`, or a player leaving — their tiles are released without an event), at most once per frame. (3) *Hover* — an outline of the hex under the mouse (a check that pointer picking matches the drawn grid), redrawn only when the hovered hex or build mode changes. Hex corner points are cached per tile (as `Vector2`s, which is what `Graphics.fillPoints` is typed for in Phaser 4). With uniform heights, cliff faces only show on the map edge; per-tile elevation would need the base layer split by height (see Planned Features).
- **Entity lifecycle**: `getStateCallbacks(room)`'s `onAdd`/`onRemove` on `players`/`projectiles`/`structures` create/destroy the corresponding Phaser game object. Existing entities at scene-create time are handled with one explicit `forEach`, since `onAdd` only fires for changes *after* the callback is registered — full state sent on join doesn't retroactively fire it.
- **Entity views and depth**: each entity remembers its smoothed *world* position (`wx`, `wy`); the Phaser object sits at `project(wx, wy)` with `setDepth(projectedY)` so things lower on screen draw in front. A player is a `Container` of a flattened shadow ellipse, a body circle lifted `BODY_LIFT` px off the ground, and a small "nose" dot on the facing direction (your own from local input so it never lags the mouse; others' from the synced `angle`). Projectiles float at body height; structures are boxes raised `STRUCTURE_LIFT`.
- **Smoothing**: `update()` reads `room.state` directly every frame (not through React) and moves each entity's world position toward `serverPosition + velocity × EXTRAPOLATION_S` by `1 − exp(−SMOOTHING_RATE × dt)` — exponential smoothing that's frame-rate independent, unlike the old fixed per-frame lerp. Jumps larger than `SNAP_DISTANCE` (a respawn) teleport instead of gliding across the map. Projectiles use the same chase with their `speed`/`angle` as the extrapolation.
- **Camera**: follows the local player's container (`startFollow`), bounded to the projected map size.
- **Input**: every frame the scene works out a *world-space* direction — from the joystick if active, otherwise from the keyboard (see [Movement](#movement); on-screen WASD by default, mouse-relative optional) — and the current `aimAngle`. `updateAim()` recomputes the aim from the mouse each frame (`pointerToWorld`: camera scroll, then `unproject`) *even if the mouse hasn't moved*, because the camera moves under it; it's skipped for touch pointers. `sendInputIfChanged()` sends at most every `INPUT_SEND_INTERVAL_MS` (50ms), only when direction or angle changed, with a `INPUT_KEEPALIVE_MS` (250ms) resend so the server's stale-input cutoff never fires on an active player.
- **Shooting**: three ways in, one gate. A pointer-down (mouse click or touch tap) is `unproject`ed to a world point and fires toward it, also setting `aimAngle` (on touch there's no mouse, so the tap becomes the aim the fire button uses next). **Space** and the mobile **FIRE** button (`setFireHeld`) fire along the current `aimAngle` — the mouse on desktop, the last movement direction or tapped point on touch — and repeat while held. All three go through `tryShoot`, which enforces `FIRE_INTERVAL_MS` (200ms, so 5 shots/s), skips sends outside the match or with no ammo, and otherwise calls `onShoot(angle)`. The cooldown is **client-side only** — the server has no fire-rate limit (see Known Issues). Space is registered as a Phaser key (so the page doesn't scroll); React buttons `blur()` after a click so Space keeps meaning "shoot" rather than "press the focused button".
- **Projectile art (placeholder)**: a `Container` of a small ground shadow, a translucent glow circle and a bright core circle floating at `BODY_LIFT` — no sprite assets yet (see Planned Features #7).
- **Building**: if `setBuildMode(true)` was called (wired to the React "Build" button in `GameScreen`), the next pointer-down instead places a structure on `pixelToHex(point)` and turns build mode back off — the tap does not also fire.

### Input — desktop and mobile share one message contract

Touch support needed no protocol changes, confirming what [Planned Features](#planned-features) predicted: `input`'s world-space `{x, y}` vector and `shoot`'s `angle` are input-method-agnostic. (The hex/mouse-aim work later added only the optional `angle` on `input`.)

- **Desktop**: mouse-aim + keyboard inside `GameScene`, above.
- **Mobile**: `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built from plain pointer events (no Phaser plugin dependency), rendered as a React overlay by `GameScreen` when `utils/device.ts`'s `isTouchDevice()` returns true. It reports the raw on-screen deflection (each axis clamped to `[-1, 1]`) to the active `GameScene` via `setJoystick()` — reached through `game.scene.getScene('GameScene')` from `GameScreen`, since the joystick is a React component with no direct reference to the Phaser scene. The scene converts it to a world-space direction each frame (undoing the iso squash, keeping the stick's strength as speed). Not yet exercised on a real touch device.

### HUD and Leaderboard — React overlays, not a Phaser UIScene

`HUD.tsx`, `ScoreBadge.tsx`, `Leaderboard.tsx` and the buttons render on top of the Phaser canvas (absolutely positioned `<div>`s in `GameScreen`), reading from `GameContext` — the same reactive `players`/`phase`/`phaseEndsAt` state already used by the lobby screen. This avoids re-deriving Colyseus reactivity a second time inside Phaser.

- **HUD** (top left): phase countdown, health ("140 / 200" — current / max), gun ("none" or its name), ammo, tiles, credits, structures left to build (e.g. "Farm" or "none"), and upgrades if any.
- **Score badge** (top center, always visible): the local player's score. Real scoring doesn't exist yet, so `utils/score.ts`'s `scoreFor()` returns credits; the badge and the leaderboard both go through it, so implementing [Planned Features #3](#planned-features) means changing that one function. Until then the badge and the HUD's Credits line show the same number.
- **Leaderboard** (popup): hidden by default; a top-right **Leaderboard** button (highlighted while open) or the **`L`** key toggles it, and **`Esc`**, the × button or a click on the dimmed backdrop closes it. It's a centered panel over the canvas (rank, color, name, score, tiles, kills, disconnected flag), ranked by `scoreFor`.
- **Shop** (popup): a **Shop** button below the Leaderboard button (during the match) or the **`E`** key toggles it (it was `B` until 2026-09-26; `B` is now build mode). Only one popup (shop or leaderboard) is open at a time; `Esc` closes either. It shows your credits, ammo and gun, then the catalog grouped under Weapons, Upgrades and Structures; items you already have (`ownsShopItem`) show "Owned". The "coming soon" list is gone — everything it listed is buyable now.
- **Build button** (bottom right, during the match): "Build Farm (1)" — the next structure in your inventory and how many are left — or a disabled "Nothing to build". Arming it makes the next tap place that structure on one of your tiles (the server uses up that inventory entry). **B** toggles build mode, **Esc** leaves it, and there's no timeout. `GameScreen` keeps the scene's build mode in sync with its own state through an effect, so leaving build mode or running out of structures returns taps to shooting.
- **Fire button** (touch only, during the match only, and only once you have a gun): a hold-to-fire button in the bottom-right corner; the **Build** button stacks above it on touch, and sits in the corner on desktop.
- **Viewport fit:** `GameScreen`'s container is `position: fixed; inset: 0`. It used to be `100vw × 100vh` inside the Vite template's `#root` (1126px wide, `min-height: 100svh`, centered text), which made the page scroll and clipped the right-hand overlays, and made the overlay text centered. Panels also set `text-align: left` explicitly.

---

## Room Lifecycle

### Creation
```
Client POST /rooms → Server creates GameRoom in Colyseus → Returns { roomId, shortCode }
Client redirects to /play/:shortCode
Client opens WebSocket → Colyseus routes to GameRoom by ID
```

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
- Player entity remains on the map (frozen — no movement, no shooting; `MovementSystem`/`CombatSystem` both skip disconnected players). **Other clients keep drawing it, dimmed** (`DISCONNECTED_ALPHA` 0.4, including the Expander ring) — it used to be hidden entirely, which made a dropped player look like it had vanished while its hexes stayed (reported 2026-09-20: a blue player in Chrome missing from Safari's view)
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

> **The scripts described in this section now live in `tools/`** (`check-rules.js`, `check-collisions.js`, `e2e.js`, `bots.js`; see `tools/README.md`). They were originally throwaway scripts run from temporary folders and were lost; they were rebuilt against the current code on 2026-09-25 and all pass (43 + 10 + 32 checks). The historical notes below describe what each verification covered when it was first done; where they mention numbers for older constants (player radius 16, claim radius 64), the scripts now read the live constants instead.

### Direct System Tests (no client/network required)

Because `MovementSystem`, `CollisionSystem`, `CombatSystem`, `StructureSystem`, and `PhaseSystem` are plain modules operating on a `GameState` instance (not `Room` subclasses), they can be exercised directly without spinning up a server or client — this is how the game logic was verified while the client/server version mismatch (see [Tech Stack](#tech-stack)) was still unresolved, and remains useful for fast, network-free regression checks.

**Verified 2026-09-19** with a throwaway script run via `npx ts-node --transpile-only`, covering:
- Movement applies input and clamps to map bounds
- Tile claiming under a moving player, batched into one `tilesClaimed` broadcast, no re-broadcast for already-owned tiles
- Projectile-vs-player hit reduces health, broadcasts `playerHit`, and on a killing blow credits the shooter's `kills` and respawns the target at full health
- Projectile-vs-structure hit destroys the structure at 0 health and broadcasts `structureDestroyed`
- Projectiles expire by age (`spawnedAt` + `PROJECTILE_LIFETIME_MS`) even without a collision
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
- `GameScreen` renders: tile grid, the local player's circle centered on screen, HUD (phase/health/ammo/tiles/credits) top-left, leaderboard top-right.
- Keyboard movement claims tiles: `tilesOwned` went 1 → 28 during a short run, tiles are drawn in the player's color, and `credits` incremented on the 10s payout.

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
- **React roster updates deduplicated:** `GameContext` published a new `players` array on *every* Colyseus `onChange`, i.e. on every server tick for every moving player (x, y, vx, vy, angle), re-rendering the whole tree ~20–30×/s. It now builds a signature of only the fields the UI shows (id, name, color, health, ammo, tiles, kills, score, credits, connected) and skips the update when unchanged. The `Player` objects are live, so components that do re-render read current values.
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
**Built:** `tools/bots.js` (`node tools/bots.js [count] [seconds] [url]`) joins wandering bots to a running match; it was used for the performance pass. The stress-testing and fuzzing ideas below are still open. Bots are the most valuable local test tool now that client/server compatibility is confirmed (see the Live Client/Server Smoke Test above) — spin up 10 to stress-test tick performance, fuzz-test edge cases (concurrent tile claims, rapid connect/disconnect), and reproduce race conditions deterministically. Not yet built.

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
    "start":        "node dist/index.js",
    "lint":         "eslint .",
    "lint:fix":     "eslint . --fix",
    "format":       "prettier --write .",
    "format:check": "prettier --check ."
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

### `.prettierrc.json` (client and server, identical)

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

_As of 2026-09-26 (after the ready-up lobby, characters and teams)._ Server and client both typecheck and lint clean, and the game runs end to end in a browser: join → lobby (team, character, ready) → 3 s countdown → mouse-aimed movement on an isometric hex map → tile claiming → credits → shooting (once armed) → building from your inventory → results.

### Working (browser- or script-verified)
- **Lobby, characters and teams** (2026-09-26: `tools/check-rules.js`, `tools/e2e.js`, and a two-tab browser pass on private ports): ready-up and the countdown (cancelled by un-readying or a newcomer; not held up by a disconnected player); team/character locked while ready and junk values refused; default teams fill empty colors first; every character's kit applied exactly at match start (and to a mid-match joiner); unarmed players can't shoot; the Basic gun arms you, once; structures come out of the inventory and carry their type; Robot boost speed; no friendly fire on teammates or their structures, teammates' structures walkable, teammates' tiles not taken; standings carry `teamId`. In the browser: the lobby at desktop and 375px width, Smuggler HUD kit, building the Farmer's farm (score +25, Build button disabled after), buying the Basic gun.
- **Player names** (2026-09-26: `check-rules.js`, `e2e.js`, and the browser): normalization and the 2–25 limit (emoji count as one), unique "(N)" suffixes ignoring case and still within 25, "Player N" fallback, renaming while ready but not mid-match, the join option. In the browser: the invalid hint on a 1-character name, Enter commits, the name saved to localStorage, and a second tab joining as "… (1)" with it; the row at 375px. Safari itself wasn't available to test the select fix.
- Join, phase timers, credits payout, HUD, leaderboard (browser).
- **Disconnect notices, reconnect, screen edge** (headless clients + browser, 2026-09-20): both other players get disconnect and reconnect events (the returning player doesn't); toasts show and fade; a tab reconnects in ~330 ms when it becomes visible (simulated); players stop exactly 20 px inside the map edge and the camera keeps them centered and fully visible there.
- **Shop: ammo and Expander** (unit + brute-force scripts and the browser, 2026-09-20): purchases validated (affordability, one Expander per player, junk ids rejected); radius claiming matches a brute-force scan; the shop UI buys ammo and the Expander, the tinted ring appears in the player's color, and enemy structures protect their hexes from claiming.
- **Results screen, right-click move** (server scripts + browser, 2026-09-20): the server broadcasts a correctly ordered `gameOver` snapshot to everyone; the results screen shows it, counts down, persists after the room closes, and *Play again* joins a fresh lobby; right-click walks to a spot and stops without overshoot, and arrow keys/WASD cancel it.
- **Shop popup and room closing** (scripts with scaled phase times, plus the browser, 2026-09-20; the `buying` phase this was verified with was removed 2026-09-26): the shop toggles with the Shop button / `B` (`Esc` closes; only one popup at a time); at the end the finished room is locked, closes on its 60s timer (or at once when the last player leaves), and the client returns to the connect screen without a reconnect loop.
- **Merged `playing` phase, new score, 50 damage, solid structures** (scripts + a two-client end-to-end run on 2026-09-20): shooting works the instant the match starts; score = tiles (+25 per structure, +50 per kill) with credits excluded; a structure blocks other players, who slide around it (744-approach sweep: 0 overlaps, 0 frozen), while its owner passes through; two hits kill. The merged-phase UI has had only a short browser look (see Testing).
- **Combat controls and UI** (third browser pass): Space/click firing with the fire interval, the projectile placeholder art in flight, hold-to-fire on the mobile FIRE button (release verified), building on a hex on touch, the always-visible score badge, the leaderboard popup (button, `L`, `Esc`), separate borders on claimed hexes, and no page scrollbars.
- **Hex map + isometric rendering**: terrain draws correctly; the hover outline lands exactly on the hex under the mouse (picking matches the drawn grid); under the first (mouse-relative) control scheme, `W` carried the player diagonally toward the cursor and claimed a line of hexes — the default is now on-screen WASD, which has been typechecked but **not yet re-run in a browser**; a click in combat fires a shot (ammo 30 → 29) (browser).
- Hex math round-trips exactly for all 4,096 tiles; velocity ramp/turn/decel numbers; off-map positions don't claim; stale input is dropped after 750ms (scripts).
- Reconnection token flow and the projectile/structure/phase server logic (scripts).

### Implemented but not yet exercised in a real browser
The results screen's team table, a real match between armed teammates and enemies (friendly fire is script-verified only), the Robot's boost in play, Structure *destruction* by shots, projectile hits on other players, the mobile joystick and `unproject` conversion on a real touch device (only emulated in a pane), the leaderboard with more than one player, reconnect after refresh/drop, real multi-player sessions, the results screen, and the stale-input fix under a genuinely backgrounded tab.

### Known bugs / rough edges
- **The connect screen still uses the Vite template's layout** (`#root`/`App.css`: fixed 1126px column, centered text, leftover hero/counter styles). The lobby, game and results screens are viewport-fixed. Cosmetic.
- **No server-side fire-rate limit.** The 200ms cooldown lives in the client (`tryShoot`); a modified client can spend all 30 ammo in one tick. Ammo is finite, so it's bounded, but the server should own this (e.g. a per-player last-shot timestamp in `GameRoom.handleShoot`) — a game-rule decision, so not done yet.
- **Results screen is basic.** No winner tie-break beyond shared ranks, no per-player details or match stats, and "Play again" starts a *new* lobby rather than a rematch in the same room. The server also doesn't tell late-leaving players anything special.
- **No client-side prediction.** Rendering is smoothed and extrapolated, but your own movement still waits for the server round trip (see Movement). Fine on localhost; needs work before real-world latency.
- **Map corners aren't hex-covered:** movement is clamped to the map rectangle, but the hex edge is jagged, so a player can stand over no hex (claiming ignores it).
- **Everything is one height:** the reference art has elevation, cliffs, water and mountains; the prototype has a single flat height, so cliff faces show only on the map edge. Structures are plain boxes and players are circles.
- **Nothing to buy at the start.** Kits give at most 50 credits and everything but ammo costs 100+, so the first purchase waits on territory income (1 credit per hex every 10 s). Worth watching in playtesting; prices are first-pass.
- **Shots are hit-tested at one size.** Big-gun bolts are drawn larger than basic ones, but both use the same server hit radius (`PROJECTILE_RADIUS` 6), so a big bolt can visually graze a player without hitting.
- **Structure types differ only in color.** Farm, mine, fort and power plant behave and score the same.
- **Other players' lobby rows wrap loosely at phone width** (team, character and "Not ready" land on separate lines). Cosmetic; to revisit with the custom pickers (Planned Features #10).
- **Everyone can pick the same team**, leaving nobody to fight. Allowed on purpose for now; no balancing or team-size cap.
- **A backgrounded tab's dropped connection: partly addressed.** Reported 2026-09-20 (Chrome blue vs Safari red: blue vanished from Safari's view). Fixed since: dropped players are drawn dimmed instead of hidden, everyone gets disconnect/reconnect notices, failed reconnects keep retrying for the whole window, and a tab reconnects immediately when it becomes visible. **Still unconfirmed:** *why* blue's connection dropped in the first place (likely browser throttling/freezing of the hidden tab), and the visible-tab trigger was tested by simulating the visibility change, not with a real backgrounded browser. When testing with two browsers, keep both windows visible. Untested idea: an indicator for players who are off-screen.
- **A ~19 fps report on the developer's machine (two browsers open) is unexplained.** The measurable scaling problems were fixed (see Performance pass), but it was never reproduced. Next step: the backtick readout's fps, ms/frame and renderer line from that machine — low fps with small ms/frame points at the GPU/browser (software WebGL, two windows sharing a GPU), not the game code.
- **Ammo never regenerates and has no cap** — the only source is buying packs (30 credits per 30 shots).
- **Reconnect retries are fixed-interval** (1.5 s, capped at 120 attempts ≈ 3 min) — no backoff.
- **Client bundle ~1.7MB** (Phaser) — Vite chunk-size warning, no code-splitting yet.
- **Mobile:** aiming on touch is limited to the movement direction or a tapped point (no second stick); phone-width layout only spot-checked at 375px (see Testing).
- **No "player left" notice** for a deliberate leave or an expired reconnect window — only disconnect/reconnect are announced.
- **Contested tile claims** resolve by player join order, not input `seq`.
- **Some files aren't 4-space yet.** The project standard is 4-space indentation (see Build Tooling), but files written before that was settled are still 2-space, so `format:check` flags them until someone runs `npm run format` in `client/` and `server/`.
- **Node version is not enforced** (no `.nvmrc` / `engines`) — see Tech Stack.
- **Dev-server restarts drop every room.** `ts-node-dev --respawn` restarts on any file change (including `tsconfig.json` and a plain `touch`), which wipes in-memory rooms and disconnects clients mid-game. Expected, but surprising when two people share one dev server.

### Open questions and ideas
1. **Should the project move off Colyseus?** Raised because of the repeated client/server compatibility problems (see Tech Stack items 1–5). Not decided. Considerations: the published `colyseus.js` client tops out at 0.16.22, so the server is stuck on the 0.16 line with exact pins; the pain so far has been version/config drift rather than fundamental design limits, and everything is now working and verified on the pinned versions. Alternatives (raw `ws` + own delta sync, or another framework) would mean re-implementing rooms, delta-compressed state sync, and reconnection.
2. **Starting positions:** players should start in a line on the right side of the map to simulate "going west". Today every player spawns at the exact map center (`GameRoom.onJoin`, and `CombatSystem` respawns to center). Needs a spawn-slot scheme for up to 10 players (spawn hexes along the right edge) and a decision on whether respawns also use it.
3. **Is terrain gameplay or decoration?** The reference image shows water, mountains and cliffs. If they block movement or projectiles, `Tile` needs a terrain (and maybe height) field and `MovementSystem`/`CombatSystem` need rules for it; if decoration, it can stay client-only art. See Planned Features #7.

---

## Planned Features

Captured 2026-09-20 as design ideas; the Phaser game view work session that followed (also 2026-09-20) implemented several of them along the way. Status is marked per item below — see the Decisions Log for what changed and why.

### 1. Credits (economy) — ✅ implemented

- `Player.credits: number` (synced schema field) and `GameState.nextPayoutAt: number` (server timestamp of the next payout, same pattern as `GamePhaseState.endsAt`).
- `server/src/systems/EconomySystem.ts`: every `CREDIT_PAYOUT_INTERVAL_MS` (10s, in `constants.ts`), every player with `tilesOwned > 0` gets `credits += tilesOwned`. Runs only during `playing` — payouts stop once `results` begins, per the open question raised when this was planned.
- Wired into `GameRoom.tick()` alongside the other systems; `nextPayoutAt` is initialized in `onCreate()`.
- Verified live: a throwaway script joined, claimed tiles, waited 11s, and confirmed `credits` incremented by exactly `tilesOwned` after one payout cycle.

### 2. Teams — first version ✅ implemented (2026-09-26)

Built as described in [Lobby, characters and teams](#lobby-characters-and-teams): teams are the 8 colors in the shared `TEAMS` catalog, chosen in the lobby (`selectTeam`), stored as `Player.teamId` (no separate `GameState.teams` map — a team has no state of its own yet). Teammates are allies: no friendly fire on players or structures, teammates' structures are walkable, and teammates don't take each other's tiles. **Tiles, credits and score stay per player** (tile-ownership option (a) from the original plan, without pooling); the results screen sums scores per team.

Still open, each a real decision rather than a follow-up:
- **Pooling.** Tiles belonging to the team (`Tile.ownerId` = team id, option (b)), and/or credits split evenly between teammates on each payout (with a remainder rule). Either changes `CollisionSystem`, `EconomySystem` and `ScoreSystem`.
- **Team win condition:** does the best team win (sum or average of scores?), or the best player?
- **Team size and balancing:** today anyone can join any color, including everyone on one team.

### 3. Scoring and win condition — scoring ✅ implemented (first version); win condition not yet

- **Implemented (2026-09-20):** `Player.score` = tiles × 1 + kills × 50 + structures × 25, computed by `ScoreSystem` (see [Score](#score)); credits are excluded. The score badge and leaderboard show it. Match length is a single 5-minute `playing` phase (`MATCH_DURATION_MS`).
- **Still to do:**
  - Structure types with their own values: `Structure.type` and `placeStructure.structureType` **exist since 2026-09-26** (farm, mine, fort, power plant — the characters' starting structures; the earlier idea was city hall 1000, school 250, house 100, fort 25). Still needed: a per-type points lookup replacing `STRUCTURE_POINTS`, what each type *does*, and a way to get more (the shop, #9).
  - The win condition: **displayed** on the results screen (highest score wins, co-winners on a tie; see [Results screen](#results-screen)), but not yet more than that — team-level scoring (sum or average, decide) once teams exist, and a real tie-break, are still open.
  - The point values are first-pass numbers to tune in playtesting; the formula is expected to change as the buy menu lands.

### 4. HUD (credits + score) — ✅ implemented (credits; score pending #3)

`client/src/components/HUD.tsx` — a React overlay (not a Phaser `UIScene`; see [Client — Phaser Game](#client--phaser-game) for why) rendered on top of the Phaser canvas by `GameScreen`. Shows the current phase and countdown, and the local player's health, ammo, tiles owned, and credits. A separate always-visible **score badge** (`ScoreBadge.tsx`, top center) shows the player's score, which is credits until #3 exists (`utils/score.ts`).

### 5. Leaderboard / player-status info panel — ✅ implemented

`client/src/components/Leaderboard.tsx` — a popup over the canvas (toggled by a button or the `L` key) listing every player sorted by `scoreFor` (credits until #3 lands), showing tiles/kills/connection status too. Needs no server changes beyond the fields it already reads — it's driven entirely by `GameContext`'s existing reactive `players` array.

### 6. Mobile web controls — ✅ implemented

- `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built with pointer events (not a Phaser plugin), reporting the on-screen stick deflection. `GameScreen` shows it when `utils/device.ts`'s `isTouchDevice()` check passes, and it feeds `GameScene.setJoystick()`, which converts it to a world-space direction and sends it through the same throttle/dedupe path the keyboard uses (see [Client — Phaser Game](#client--phaser-game)) — no separate server-side handling needed, confirming the original prediction that the existing `input`/`shoot` message shapes already supported this.
- **Fire button:** `FireButton.tsx` (touch + during the match only) holds `GameScene.setFireHeld(true)` while pressed; the scene repeats shots at the fire interval along the current aim. Tapping the map still aims and fires toward the tap, and arms placement when Build is on — the same handlers serve mouse and touch. Verified in a 375×812 touch-emulated pane: it fires (ammo 30 → 29), releases cleanly (no runaway fire), and Build correctly places a structure without also shooting.
- Not yet done: a second aim stick (touch aim is movement direction or tap), and responsive tuning beyond a 375px spot check (HUD, score badge and Leaderboard button fit on one row without overlapping, though the HUD is close to the badge once the countdown reaches three digits).

### 7. Terrain, elevation, and real art — not implemented

Driven by reference art showing hex tiles with mountains, trees, water and cliff faces. Prototype status: one flat height, primitive shapes, no terrain.
- **Decide first** whether terrain is gameplay (blocks movement/projectiles, maybe unclaimable — needs `Tile.terrain`/`Tile.height` in the schema and rules in `MovementSystem`/`CombatSystem`/`CollisionSystem`) or purely visual (client-only art keyed off a seeded map, no protocol change).
- **Rendering with elevation:** the static base layer must draw tiles back-to-front with each tile's cliff height, so heights vary per tile; tall props (mountains, trees, structures) need depth sorting against players using `setDepth(projectedY)` like entities already do. Keep the top-down world as the source of truth and add height only as a render offset.
- **Art:** the reference image is AI-generated (watermarked, irregular tile shapes, unclear licensing) — treat it as mood only. Real tiles need a consistent hex footprint (64 × ~55 px top at the current size/squash, plus cliff height) so sprites tile cleanly; sprites replace `GameScene`'s primitives without an architecture change (needs a preload step, since the scene currently loads nothing).
- **Six-direction character sprites:** flat-top hexes suggest six facings (0°, 60°, 120°, 180°, 240°, 300°) with one animation each. Pick the animation from the *projected* (on-screen) velocity, not the world one, because the iso squash bends the angles — bucket the screen angle to the nearest of the six hex-neighbor directions as they appear on screen. Movement itself stays free-form vector velocity (already server-authoritative), so this is purely a visual layer and needs no protocol change; idle = stop the animation. (Phaser arcade physics, often shown alongside this technique, isn't involved: the server owns all movement and collision.)
- **Map shape:** the jagged hex edge vs. rectangular movement bounds (see Known Issues) is worth fixing at the same time, e.g. by clamping to the nearest valid hex.

### 8. Client-side prediction — not implemented

Simulate the local player with the same acceleration model as `MovementSystem` (share the step function between client and server), replay unacknowledged inputs against each authoritative update (the `seq`/`inputAck` plumbing already exists for this), and correct smoothly. Do this once latency is a real concern; the extrapolation/smoothing already in place hides tick-rate stepping but not round-trip delay.

### 9. Shop and upgrades — ammo, Basic gun and Expander built; the rest planned

**Where it lives:** during play, on the player's own time (a Shop button or `E`; nothing pauses while it's open). A 30-second `buying` phase before play existed from 2026-09-20 until **2026-09-26**, when the ready-up lobby replaced it; starting credits now come from the character (50, or 15 for the Smuggler).

**Built (2026-09-20):** the menu (`BuyMenu.tsx`) lists real items with prices and Buy buttons — **Ammo pack** (30 credits for 30 shots) and **Expander** (100 credits; claim radius ×2, one per player, with a tinted circle) — see [Shop](#shop). Buttons disable when you can't afford an item or already own it. Below them a "coming soon" list shows the ideas that aren't buyable yet (better gun, armor, structures). The **Basic gun** was added 2026-09-26, since only the Smuggler starts armed. (The temporary `endBuying` shortcut went with the buying phase.) **Later on 2026-09-26** the catalog became data-driven and gained the Big gun, Speed boost, Armor and all four structures, the Basic gun went to 100, and the "coming soon" list was removed — see [Shop](#shop).

**Still to design and build:**
- More items (a new entry in `SHOP_ITEMS`; a new *kind* of effect also needs a line in `ShopSystem`): per-gun fire rate, range, or spread; stronger armor; what each structure type *does*.
- **Ammo:** decide on a cap; ammo still never regenerates (buying is the only source). Only the Smuggler starts with a gun (and 15 ammo); everyone else buys one.
- **Candidate constraint:** only allow buying/upgrading during play while standing on your own territory (or near a city hall) so shopping carries risk. Not decided.
- The server-side fire-rate limit belongs here too (per-gun fire rate).
- Balance: the Expander is strong (up to 9× claiming per step) for 100 credits — no longer affordable at the start (≤ 50 credits), so it's now a mid-match buy. Watch for snowballing (territory income plus purchases compound for whoever leads); consider cost scaling, a radius cap, or making upgrades stackable with rising prices.
- Mobile: the Shop button and popup fit a 375px viewport in principle but haven't been tried on a real device.

### 10. Custom lobby pickers — planned (requested 2026-09-26)

Replace the lobby's native `<select>`s (currently restyled with `appearance: none` as a stopgap):
- **Team picker:** a row/grid of **color swatches**, sized for touch on mobile (at least ~44px targets), showing which colors have players and which is yours.
- **Character picker:** a custom component — likely cards with the character's art (once there is art, #7) and kit, rather than a text list.
- Tidy other players' rows at phone width at the same time (see Known Issues).

---


## Decisions Log

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
| PvP death handling | Respawn at map center, full health, kills/tiles preserved | Elimination, sudden-death end-of-match | This is a territory-claiming game, not a deathmatch — PvP is a tool for defending/contesting tiles, not the win condition, so a defeated player should get back in the fight quickly |
| Host concept — **superseded 2026-09-26 (ready-up lobby)** | First player to join a room is `hostId`; only they can send `startGame`; reassigned to next connected player on host departure | No host (auto-start at max players or after a lobby timer), server-side matchmaking-assigned host | Simplest to implement for a scaffold; a lobby timer or player-ready-up voting could replace this later without changing the wire protocol much |
| Ammo | Finite (30), decrements per shot, no regen yet | Infinite ammo, regen over time, reload mechanic | Left as a known gap — finite ammo without regen makes for a hard stop mid-match, which is a real gameplay concern to resolve before this ships, not just a technical TODO |
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
| Credits payout scope | Every player earns 1 credit per tile they individually own, during `playing` only (formerly `claiming`/`combat`) | Payouts continuing into `results`, or scoped only to the old `combat` phase | Matches the request's "based on number of tiles they control" without over-scoping into phases where tile ownership isn't changing meaningfully or the match is already decided; open questions about team-pooled credits remain in Planned Features #2 |
| Pinning `@colyseus/core` | Exact-pin all four Colyseus packages (`colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5), no `^` | Leave `@colyseus/core` to resolve as a peer dependency | It is only a peer of `colyseus`/`ws-transport`, so an unpinned install resolved it to 0.18.14, whose `Room` generics and `onLeave` signature are incompatible with 0.16 and broke `tsc`. Exact pins plus a lockfile regenerated from a clean install prevent silent drift (2026-09-20) |
| Publishing the room to React | `GameContext.connect()` waits for the first state (`onStateChange.once`) before `setRoom`/`setStatus('connected')` | Publish the room as soon as `joinOrCreate` resolves and null-check `state` everywhere | The join promise resolves before the initial full-state message is decoded, so `room.state.phase` is undefined at that moment. Waiting once at the boundary lets every consumer assume populated state |
| `<GameProvider>` placement | Wrap `<App />` in `main.tsx` | Provide the context lower in the tree, or make `useGameConnection()` tolerate a missing provider | `App` itself consumes the context, so the provider must sit above it. Missing it gave a fully blank page with only a console error; the hook's throw is intentional, since it surfaces the mistake immediately |
| Version-drift guardrails | Document exact pins and the "run a real client against a real server" check; `.nvmrc`/`engines` not yet added | Trust isolated build/lint passes | Three of the five compatibility bugs to date (the matchmake protocol mismatch, the `useDefineForClassFields` encode crash, and that setting missing from the committed `tsconfig.json`) passed every per-side build/lint check and surfaced only when a real client joined a real server; the other two (`@colyseus/core` peer drift, `index.ts` on the 0.18 API) were caught by `tsc`. Separately, a Node 13 default shell can't run TS 6 at all |
| Whether to leave Colyseus | **Undecided** — staying on pinned 0.16.x for now | Raw `ws` + custom sync; another framework | Because of the compatibility churn in early development. Everything works and is verified on the pinned versions, and replacing rooms/delta sync/reconnection is a large cost; revisit if the 0.16 line's lack of updates or a needed feature becomes a real blocker |
| Git workflow | The user runs all git commands; Claude edits files and asks the user to commit | Claude commits/pushes | Stated preference in `CLAUDE.md` — the user wants to review what's being committed |
| Map grid | Flat-top hexes, odd-q offset, stored in the same flat array (`row * cols + col`); axial/cube coordinates used only inside `pixelToHex` | Keep square tiles; pointy-top; axial storage | Hexes are the intended design. Odd-q keeps the map rectangular and the schema/array unchanged, and flat-top matches the reference art. Only tile lookup, structure hits, bounds and rendering had to change — claiming is by position, not adjacency, so this was cheap to do before teams/structure types |
| Isometric implementation | Render-only vertical squash (`ISO_SQUASH = 0.6`) of a top-down world; server never sees it | True 45° isometric projection; simulating in screen space | A single scale factor gives the ~2:1 hex look of the reference, keeps server hex/collision/movement simple, and inverts trivially. The cost — every pointer/joystick vector must be `unproject`ed before use — is confined to `GameScene` |
| Movement model | Acceleration-limited velocity (`PLAYER_ACCEL`), world-space input vector (magnitude = speed) + facing angle | Instantly setting velocity from the input (previous behavior); stepping tile to tile | Smooth start/stop/turn at any angle and analog joystick speed, with a server change only in `MovementSystem`. `vx`/`vy`/`angle` are synced so clients can extrapolate and draw facing |
| Desktop controls | Fixed on-screen WASD/arrows; mouse only aims and shoots (`MOVE_RELATIVE_TO_AIM = false`) | Mouse-relative "forward" with strafing (tried first; still available via the flag) | Mouse-relative movement felt weird: the camera follows the player, so the cursor's world position keeps moving as you approach it (chasing), and strafing orbits it. On-screen keys are predictable and match the view. Aim is still recomputed every frame because the camera moves under a still mouse |
| Speed metric | Uniform on screen: server measures speed/acceleration with world y scaled by `SCREEN_Y_SCALE` (= client `ISO_SQUASH`); client `UNIFORM_SCREEN_SPEED` sends the unnormalized `unproject`ed direction | Uniform in world space (previous behavior: up/down looked ~40% slower) | Requested after playtesting: with the tilted view, equal world speed reads as slower vertical movement. Costs a little "purity" (server knows the tilt) and makes vertical world distance/hexes cross faster. Reversible with `SCREEN_Y_SCALE = 1` + `UNIFORM_SCREEN_SPEED = false`. Projectiles use the same rule (see PvP Shooting) |
| Swept projectile-vs-player test | Test the segment each projectile travelled this tick against the player's circle | End-point-only distance check (previous) | Making vertical shots screen-uniform raised their step to ~33 world px/tick vs a 22 px hit radius; grazing shots then skipped players (56–75% hit rate at the hitbox edge). Sweeping fixes it for every direction (100% in a Monte Carlo test) at the cost of a few multiplications per projectile-player pair |
| Leaderboard presentation | Popup over the canvas, toggled by a button or `L` (closed by `Esc`/×/backdrop), hidden by default | Always-on corner panel (previous) | The always-on panel was clipped and covered the play area on small screens; a popup is roomier and only costs space when wanted. The player's own score stays visible in a small always-on badge instead |
| Score display | `scoreFor(player)` in `utils/score.ts` returns credits for now; used by the badge and leaderboard | Show credits directly everywhere; design and build the scoring formula now | Real scoring has open questions (Planned Features #3), but the UI needs *a* score now. Routing through one function makes the eventual formula a one-line swap without touching components |
| Fire input | Space, click and a touch FIRE button all go through `GameScene.tryShoot` with a 200ms client-side interval | Click only (previous); server-enforced fire rate first | Requested controls; a shared gate avoids three divergent code paths. Server enforcement is the right long-term home but is a game-rule decision, so it's deferred and logged as a Known Issue |
| Claimed-hex borders | Re-stroke each claimed hex with a darkened version of its own fill | Draw claims beneath the base outline; leave as one flat color | The claim fill covers the base outline, merging adjacent same-color hexes into a blob. Darkening the fill (not a fixed color) keeps borders visible on every player color |
| Game screen container | `position: fixed; inset: 0` | `100vw × 100vh` inside the template `#root` (previous) | The template `#root` (1126px, min-height) plus 100vw/100vh produced scrollbars and clipped right-side overlays; fixed positioning takes the game out of that flow entirely |
| Terrain rendering | Bake the base and claims layers into `RenderTexture`s (re-bake claims only when dirty) | Leave them as `Graphics` objects (previous) | Measured in the browser: with the base layer as `Graphics`, a frame cost ~53 ms of JS (hiding it dropped that to <1 ms), i.e. <20 fps; baked, it's ~0.75 ms/frame. Costs one ~3088×2157 texture (~26 MB) and needs a GPU max texture size ≥ that (fine on desktop; worth chunking for older mobile GPUs) |
| Match phases | One `playing` phase (5 min) between `lobby` and `results` (a `buying` phase was added before it afterwards — see below) | Separate `claiming` (90s) and `combat` (120s) phases (previous); a separate "buying" phase | Claiming and fighting should happen together, and buying is better as an in-game menu than a phase that pauses everyone. The early-shooting problem the claiming phase solved goes away once guns/ammo are purchases |
| Score formula | `tiles × 1 + kills × 50 + structures × 25`, computed server-side into `Player.score`; credits excluded | Score from credits (previous); client-side derivation | Requested. Credits will be spent, so scoring them would make buying cost points. A synced server field keeps every client identical and lets the leaderboard/badge just read it |
| Damage | 50 per hit vs 100 health (two-hit kill) | 25 per hit (previous) | Requested. Armor and better guns will modify this later |
| Structures are solid | Others can't enter a structure's hex; they slide around it; the owner passes freely; a player already inside can walk out | Structures only stop projectiles (previous); no exceptions for owners | Requested. Implemented as circle-vs-hexagon with rounded corners; sliding uses the push-out direction at the player's *current* position (using the destination's normal leaves players frozen at corners), and a small distance tolerance so tangential slides aren't mistaken for approaching. Validated with a 744-approach sweep (0 overlaps, 0 frozen; the only stops were dead-on flat-wall hits) and a two-client run |
| Finished-room lifecycle | Lock the room when the match ends; close it after a 60s results period (`RESULTS_DURATION_MS`) or immediately when the last player leaves; no reconnect window during `results` | Leave finished rooms open (previous); a 2–3 minute grace period | Finished rooms were being reused by `joinOrCreate`. There's no formal standard for the timeout; a minute is enough to look at results, and there's no results screen/rematch to justify longer. One constant to change |
| Buying phase — **superseded 2026-09-26 (ready-up lobby)** | A 30s `buying` phase between lobby and playing (nothing else allowed), plus in-play shopping on the player's own time | No buying phase, only an in-game menu (decided earlier the same day); a long shopping phase | Reversed by request: a quick shared shopping window gives a clean start, while play-time buying keeps the game continuous. Also removes the "shoot before anyone has claimed anything" problem without a protected phase |
| Starting credits — **superseded 2026-09-26 (ready-up lobby)** | 100 (`STARTING_CREDITS`), set as the schema default | 0 with payouts only | Requested, so there's something to spend in the buying phase |
| Server-closed room vs. client | Client treats close codes 1000 and 4000 as deliberate | Only 1000 (previous) | The server closes finished rooms with Colyseus's `CONSENTED` code (4000); treating it as a dropped connection would send the client into its reconnect loop and silently into a new lobby |
| `PHASE_TIME_SCALE` | Env var scaling all phase lengths, read once in `constants.ts` | Editing constants for tests; waiting real time | Testing the full lifecycle took minutes of waiting per browser run; a scale of 0.02–0.1 runs a whole match in seconds without touching code. Not for production use |
| Results screen data | The server sends one `gameOver` snapshot of final standings; the client keeps it in context and shows the screen even after the room closes | Read live room state; a screen that needs the room to stay open | Live state changes if someone leaves and vanishes when the room closes. A snapshot is stable and lets the screen outlive the room. Ties share a rank (no tie-break yet) |
| Results screen actions | *Play again* (new lobby) and *Main menu* | Auto-drop players into a new lobby when the room closes; rematch in the same room | Deliberate choice rather than a surprise. The 60s room timer plus a persisted screen means nothing is lost when the room closes. Same-room rematch would need a reset flow and is deferred |
| Click-to-move | Right-click sets a world-space target the client walks toward via the normal `input` vector; eases off near it; cancels on arrival, no progress for 1.2 s, or any movement key/joystick | Server-side pathing/targets; left-click to move | Requested. Doing it client-side needs no server change and reuses smoothing, screen-uniform speed and structure sliding. Speed is scaled by distance (not a hard stop) to avoid overshoot despite ~100–200 ms input latency; a no-progress timeout stops it chasing an unreachable spot |
| Ending buying early (temporary) — **superseded 2026-09-26 (ready-up lobby)** | Closing the shop during `buying` sends `endBuying`; only the host's is honored | Waiting out the 30s; letting any player end it | Requested testing shortcut: with a mock shop there's nothing to do while buying. Host-only so one player closing their popup can't start the match for everyone; to be removed when the real buy menu exists |
| Claim layer rendering | 512-px chunk `RenderTexture`s, re-baking only chunks whose hex owners changed (diff against `renderedOwners`) | One full-map claim texture re-baked on every change (previous); per-hex incremental stamping | Re-bake cost grew with every claimed hex (7.7 ms at 442 → projected ~20 ms at ~1,100) and would spike late in a match; chunks bound it (2.3 ms flat). Per-hex stamping was rejected: the 2px claim border spills onto neighbors, so un-claiming a hex would leave artifacts unless its neighbors were repainted too. Chunks keep the exact previous visuals and the same "redraw what's claimed here from state" logic |
| React roster updates | Publish a new `players` array only when a *displayed* field changes (signature check) | Publish on every Colyseus `onChange` (previous) | Positions/velocity/aim change every tick per moving player and are never shown in React, yet each one re-rendered the whole provider tree (~30 renders/s measured). Now ~6/s |
| GPU selection | `powerPreference: 'high-performance'` | Browser default | Dual-GPU laptops default to the integrated GPU; the game is a good reason to ask for the discrete one. Harmless elsewhere |
| Claim radius | Claim the hex you stand on plus every hex whose center is within `claimRadius` (base 32 px = `HEX_SIZE`; Expander 80 px = 4 × `PLAYER_RADIUS`) | Keep "only the hex under you" and make the Expander a different mechanic; a fixed ring of neighbors | A radius makes "2× radius" literal and scales naturally for future upgrades. At base radius it's effectively the old behavior (own hex, occasionally a neighbor near an edge). Implemented as a small search window around the player, verified against a brute-force scan |
| Structures protect their tile | A hex with another player's structure can't be claimed | Let radius claiming flip any tile | With a large radius, tiles under structures would flip constantly, leaving a structure on a tile its owner doesn't own (and placing requires owning the tile). Rejected the alternative of destroying the structure on flip |
| Expander | 100 credits, claim radius 4 × the player radius (80 px), permanent (kept on respawn), one per player, visible to everyone as a tinted circle | Stackable levels; lost on death; visible only to its owner | Matches the requested spec (one item, 2×). One-per-player keeps the first version simple and bounded; the circle doubles as a warning to opponents. Balance is untested — see Planned Features #9 |
| Ammo pricing | 1 credit per shot, sold in packs of 30 (30 credits), no cap | Per-shot purchase; capped magazine | Requested. No cap is a known gap; tune with playtesting |
| Shop catalog location | One `SHOP_ITEMS` block in `types/shared.ts`, mirrored on both sides | Prices hard-coded in the server and duplicated in the client menu | Server validation and the menu read the same numbers, so a price change is one edit (in both hand-synced copies) instead of a silent mismatch |
| Player size | `PLAYER_RADIUS` raised from 16 to 20 (body, projectile hit radius, structure collision); the Expander's claim radius is *defined* as 4 × `PLAYER_RADIUS` | Keep 16; keep the Expander at 2 × the base claim radius | Requested playtest of a bigger player. The Expander used to be 2 × a 32 px base claim radius, which is independent of body size, so it wouldn't have grown; tying it to `PLAYER_RADIUS` (4 × = 64 at 16, 80 at 20) makes the two move together while the base claim radius (and so base tile-claiming pace) stays put. If instead the base claim radius should also follow the player size, that is a one-line change but speeds up base claiming (~50% more hexes per step at 40 px) |
| Claimed-hex border strength | `CLAIM_BORDER_DARKEN` 0.3, `CLAIM_BORDER_WIDTH` 1.5 (was 0.45 / 2) | Original stronger border; no border | Requested subtler lines: still enough to tell same-colored hexes apart, without a heavy grid over the owner's color. Both are single constants to tune |
| Shop button feedback | Real CSS (`:hover`, `:active`) plus a 700 ms green "✓" confirmation on press | Inline styles only; toast messages | Inline styles can't express hover/pressed states. The confirmation is shown when the button is pressed (the server accepts any purchase the button allowed); a server acknowledgment isn't sent, so a lost race would still flash |
| Disconnected players on screen | Keep drawing them, dimmed to 40% alpha | Hide them (previous behavior) | The server holds a dropped player's seat, tiles and body for the 3-minute reconnect window, and the body is still a valid target, so hiding it made a frozen, shootable player invisible while its territory stayed on the map. Dimmed makes "connection dropped" readable at a glance (the leaderboard also flags it) |
| Disconnect/reconnect notices | Server broadcasts `playerDisconnected` / `playerReconnected` (with names) to everyone but the returning player; client shows auto-dismissing toasts | Rely on the leaderboard's "(disconnected)" flag; notify only the host | Requested: all players should know. Toasts are visible where players actually look; the events already existed in the shared types |
| Reconnect triggers | Retry every 1.5 s for the length of the server window, and reconnect immediately on `visibilitychange` / `online` | Single retry timer; give up after one failed attempt (previous) | Hidden tabs throttle timers, and one failed attempt (e.g. right after waking) shouldn't strand the player on an error screen |
| Screen edge | Camera has no bounds (always centers the player); players stay `MAP_EDGE_MARGIN` inside the map | Keep the bounded camera; clamp the player to the visible screen | A bounded camera pinned the player against the screen edge at the map's edge, clipping the body. Centering always keeps them fully visible at any window size; the margin keeps the body on the terrain. Cost: empty space visible beyond the map |
| Host reassignment — **superseded 2026-09-26 (ready-up lobby)** | Promote the next connected player as soon as the host disconnects; a newcomer also takes over if the recorded host is disconnected; keep a lone disconnected host so a reconnect restores them | Promote only when the reconnect window expires (previous behavior); always keep the original host | A disconnected host can't send `startGame`, and the old behavior blocked a lobby for up to 3 minutes (it also made the shared dev room confusing) |
| Stale input | Server discards input older than `INPUT_STALE_MS` (750ms); client keeps alive every 250ms | Trust the last input indefinitely (previous behavior) | A backgrounded tab pauses Phaser's loop, so "key released" never got sent and the player ran on forever. Any silent client (tab hidden, network stall) now coasts to a stop |
| Client smoothness | Frame-rate-independent exponential smoothing toward `state + velocity × EXTRAPOLATION_S`; snap on large jumps | Fixed per-frame lerp (previous); full client-side prediction now | Hides the 20Hz tick stepping at any frame rate for little code. Prediction/reconciliation is deferred (Planned Features #8) until latency actually matters |
| Hex rendering | Three `Graphics` layers: static base (drawn once), claims tint (dirty-flag redraw, claimed hexes only), hover outline | One `Graphics` redrawn on every `tilesClaimed`; one game object per tile | `tilesClaimed` fires nearly every tick while moving; redrawing 4,096 hexes with cliff faces each time was the expensive path. Only the small claims layer redraws |
| Structure hit test — **superseded 2026-09-26 (hexagon containment)** | Projectile is inside the structure's hex (`pixelToHex` equality) | Circle or AABB approximation of a hex | Exact for a structure that fills its whole hex, and no extra geometry |
| Starting the match | Automatic 3s countdown once every connected player is ready; cancelled if anyone un-readies or a newcomer joins; disconnected players don't block it. No Start button and no host | Host presses Start once everyone is ready; auto countdown plus a host force-start | Chosen by the developer (2026-09-26). Nobody has to be in charge, so the host role and its handover logic went away |
| Removing the buying phase | Deleted `buying`, `startGame`, `endBuying` and `STARTING_CREDITS`; shopping is during play only; starting credits come from the character | Keep a short buying phase after the lobby | Requested: the lobby's character choice now sets the starting kit, which is what the buying phase was for |
| Countdown as its own phase | `countdown` phase (lobby screen still shown), owned by `LobbySystem` together with applying kits at its end | Keep `lobby` and use `endsAt > 0` as "counting down" | A self-describing phase string is clearer for the client, logs and tests; `PhaseSystem` now only times `playing` |
| Teams | A team is one of 8 colors (`TEAMS`); `Player.teamId`, with `Player.color` always the team color; newcomers get an empty color first | A `GameState.teams` map with team state; auto-balancing | Picking a team is the same as picking a color (requested), and all existing rendering already used the player color. A team has no state of its own yet, so no map |
| What teammates share | Allies only: no friendly fire (players and structures), teammates' structures walkable, teammates' tiles not taken. Tiles, credits and score per player; results add team totals | Full pooling (tiles owned by the team, credits split evenly, team score); color only, free-for-all | Chosen by the developer (2026-09-26) as the smallest change that makes teams meaningful; pooling stays an open question |
| Characters | 6 characters in a shared `CHARACTERS` catalog; the kit (gun, ammo, credits, structures, upgrades) replaces the player's stats when the countdown ends; locked while ready | Apply the kit at selection time; free choice after readying | Applying once at start means lobby switching can't be abused and a mid-match joiner just gets the default kit applied on join |
| Structure inventory | `Player.structureInventory` (one entry per structure); `placeStructure` names a type from it and uses one up; `Structure.type` recorded; all types identical for now | Unlimited building with the character setting only the type | Chosen by the developer (2026-09-26): the starting structures are part of what distinguishes characters |
| Getting a gun | Unarmed players can't shoot; a Basic gun in the shop (40 credits at first, 100 since the catalog rebuild) | Only Smugglers can shoot until a later shop pass | Chosen by the developer (2026-09-26), so the other five characters can still fight |
| Robot boost | `boost` upgrade multiplies top speed by 1.25 (`BOOST_SPEED_MULTIPLIER`), acceleration unchanged | Higher acceleration too; a timed boost | "Speed boost" was the spec; 1.25 is a first-pass value to tune |
| Player names | Editable in the lobby, 2–25 characters (code points), any characters; a taken name (ignoring case) gets the first free " (N)"; saved to `localStorage` and sent as a join option | Allow duplicate names; server-side accounts | The developer allowed either; the suffix keeps names readable in the leaderboard and results and fixed the old duplicate "Player N" bug. Saving the typed (unsuffixed) name avoids stacking suffixes over games |
| Structure footprint | A structure occupies its hex plus the 6 neighbors; all 7 must be on the map, owned by the builder, and free of other footprints | Single hex (previous); allowing teammates' hexes | Requested (2026-09-26) |
| Structure shape — **superseded the same day (flat-top, 2 × tile radius)** | One hexagon with exactly the 7 hexes' area, corners on grid vertices, turned ~19.1° from the tiles; used for collision, hits and drawing, while the footprint hexes are used for placement and protection | A tile-aligned hexagon covering the 7 hexes (~29% larger, reaching well into the next ring); the jagged 7-hex outline | "A hexagon the size of 7 tiles" was requested; this is the only hexagon with exactly that area whose corners sit on the grid. Cost: 6 of the 12 touching placements overlap by ≤ 10.5 px, accepted rather than refusing placements whose 7 hexes are all yours |
| Structure colors | Top face by type (farm pale lime, mine dark brown, fort sandstone, power plant pale cyan); sides and border in the owner's team color | Type color only; team color only | Temporary until art (requested). Both pieces of information stay visible |
| Structure shape (revised) | Flat-top hexagon with 2 × the tile radius: the largest flat-top hexagon inside the 7-hex footprint, corners on the footprint's notches | The ~19.1°-turned equal-area hexagon (previous); a smaller hexagon | Requested: ~75% of the previous size with a flat top. 2/√7 ≈ 76% is exactly the size that still fits, and staying inside the footprint means structures can never overlap |
| Build mode | No timeout; B toggles, Esc exits (the Build button still works) | The 5 s auto-disarm (previous) | Requested. Lining up a 7-hex spot takes longer than 5 s |
| Hotkeys | B = build mode, E = shop, L = leaderboard, Esc = leave build mode / close popups | B = shop (previous) | Requested |
| Shop catalog | Data-driven `SHOP_ITEMS` with categories; each item names what it gives; shared `ownsShopItem` decides "already have it" for both server and menu | A hand-written case per item in `ShopSystem` and the menu (previous) | With ten items, keeping the rules in one table stops the server and the menu drifting apart |
| Prices and new items | Basic gun 100, Big gun 200 (100 damage), Speed boost 100, Armor 100 (200 max health), structures 100 each, ammo 30, Expander 100 | — | Prices requested; the Big gun's effect (double damage) and the gun rules (no downgrade, can skip the basic gun) are first-pass choices |
| Shot looks by gun | Basic: small white bolt; big: the original yellow bolt, 1.3× larger. Chosen by `Projectile.damage` (already synced); hit radius unchanged | Syncing the gun id on the projectile; a bigger hit radius for big shots | Requested. Damage is already on the projectile, so no protocol change; the hit radius was left alone since only the look was asked for |
