# Multiplayer Territory Game — Technical Blueprint

> A real-time multiplayer territory-claiming game with PvP shooting and destructible structures. Inspired by hexar.io. Up to 8–10 players per match, tile-based map, timed game phases.

---

## Table of Contents

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

│   │   ├── rooms/
│   │   │   └── GameRoom.ts         # Colyseus room — lifecycle, message handlers, tick loop
│   │   ├── state/
│   │   │   └── GameState.ts        # Colyseus schema definitions
│   │   ├── systems/
│   │   │   ├── Broadcast.ts        # Shared callback type systems use to emit discrete events
│   │   │   ├── MovementSystem.ts   # Eases velocity toward the input direction (accel-limited), drops stale input
│   │   │   ├── CollisionSystem.ts  # Tile-claiming collision, batched tilesClaimed broadcast
│   │   │   ├── CombatSystem.ts     # Projectile movement, hit detection, respawn-on-death
│   │   │   ├── StructureSystem.ts  # Structure damage/destruction
│   │   │   ├── PhaseSystem.ts      # Phase transitions, timer management
│   │   │   └── EconomySystem.ts    # Credit payouts (1/tile/10s)
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
│   │   │   └── device.ts           # isTouchDevice() — picks keyboard vs. virtual-joystick input
│   │   ├── components/
│   │   │   ├── HUD.tsx             # Own player's health/ammo/tiles/credits + phase countdown
│   │   │   ├── Leaderboard.tsx     # All players ranked by credits (stand-in for score — see Planned Features)
│   │   │   └── MobileJoystick.tsx  # Drag-based virtual joystick (touch input)
│   │   ├── screens/
│   │   │   └── GameScreen.tsx      # Hosts the Phaser canvas + HUD/leaderboard/joystick/build-button overlays
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
│   ├── technical-blueprint.md      # This document
│   └── session-handoff.md          # HISTORICAL — written to bootstrap the 2026-09-20 session; superseded by this doc, not maintained
├── README.md                       # How to install, run, build, lint; controls; troubleshooting
├── CLAUDE.md                       # Working preferences for Claude Code (notably: the user runs their own git commands)
└── dev-notes.md                    # Scratch list of open ideas/questions — see Current Status & Known Issues
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
// Player movement input. `dir` is a WORLD-space (top-down) vector; magnitude 0..1 sets speed
// (analog joystick), longer vectors are clamped. `angle` (optional) is the facing/aim in radians.
// Send at most every 50ms, and at least every 250ms while active — the server discards input older than 750ms.
{ type: "input", dir: { x: number, y: number }, angle?: number, seq: number }

// Player shoots
{ type: "shoot", angle: number, seq: number }

// Place structure. tileX/tileY are hex column/row (offset coords), not pixels.
{ type: "placeStructure", tileX: number, tileY: number, seq: number }

// Host starts the game (lobby -> claiming). No payload.
{ type: "startGame" }

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
{ type: "gameOver",      scores: Array<{ playerId, tilesOwned, kills }> }

// Sent to the originating client only (client.send, not broadcast):
{ type: "inputAck", seq: number }
```

> **Implemented and verified 2026-09-19** via direct system-level tests (no client needed — see Testing Multiplayer Locally): `playerHit`, `tilesClaimed` (batched per tick, not one broadcast per tile), `structureDestroyed`, and `phaseChanged` all fire correctly. `inputAck` is sent per-client via `client.send()` rather than broadcast, since it's only meaningful to the client that sent the input. `playerDisconnected`/`playerReconnected`/`gameOver` events from the original design are **not yet wired up** — connection state changes are currently visible only via the `Player.connected` schema field's delta sync, and there's no end-of-match scoring/gameOver flow yet (the `results` phase is entered but nothing happens in it besides the phase timer).

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

This is the actual, verified-working implementation — not a sketch. Per-player transient state (last input, host tracking, a projectile-id counter) lives as private fields on the room rather than in the synced schema, since clients don't need to see it.

```typescript
import { Room, Client } from 'colyseus';
import { GameState, Player, Tile, Projectile, Structure } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import { EconomySystem } from '../systems/EconomySystem';
import type { Broadcast } from '../systems/Broadcast';
import { hexIndex, isValidHex, mapPixelSize } from '../hex';
import { TICK_RATE, RECONNECT_WINDOW_SECONDS, CREDIT_PAYOUT_INTERVAL_MS } from '../constants';
import type {
  InputMessage,
  ShootMessage,
  PlaceStructureMessage,
  InputAckEvent,
} from '../types/shared';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', /* ... */];

export class GameRoom extends Room<GameState> {
  maxClients = 10;

  // NOT `inputs` — that name is reserved by the base Room class.
  private playerInputs = new Map<string, PlayerInput>();
  private hostId: string | null = null;
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
    this.onMessage('startGame', (client) => this.handleStartGame(client));
  }

  onJoin(client: Client): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = `Player ${this.state.players.size + 1}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    const { width, height } = mapPixelSize(this.state.mapWidth, this.state.mapHeight);
    player.x = width / 2; // everyone spawns at map center for now — see Current Status (open question)
    player.y = height / 2;
    this.state.players.set(client.sessionId, player);

    if (this.hostId === null) this.hostId = client.sessionId; // first joiner is host
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    if (consented) {
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

    if (this.hostId === sessionId) {
      const next = Array.from(this.state.players.values()).find((p) => p.connected);
      this.hostId = next ? next.id : null; // promote the next connected player
    }
  }

  private tick(dt: number): void {
    MovementSystem.update(this.state, this.playerInputs, dt);
    CollisionSystem.update(this.state, this.broadcastEvent);
    CombatSystem.update(this.state, dt, this.broadcastEvent);
    PhaseSystem.update(this.state, this.broadcastEvent);
    EconomySystem.update(this.state);
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
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;
    if (player.ammo <= 0) return;

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
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;

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
    this.state.structures.set(structure.id, structure);
  }

  private handleStartGame(client: Client): void {
    if (client.sessionId !== this.hostId) return;
    if (this.state.phase.phase !== 'lobby') return;
    PhaseSystem.transitionTo(this.state, 'claiming', this.broadcastEvent);
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
  @type('number')  ammo: number = 30;
  @type('number')  tilesOwned: number = 0;
  @type('number')  kills: number = 0;
  @type('number')  credits: number = 0;            // see EconomySystem
  @type('boolean') connected: boolean = true;
  @type('string')  color: string = '';           // hex color for tile ownership
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
  @type('number')  speed: number = 400;    // pixels/sec
  @type('number')  spawnedAt: number = 0;  // server timestamp ms, for lifetime expiry
}

export class Structure extends Schema {
  @type('string')  id: string = '';
  @type('string')  ownerId: string = '';
  @type('number')  tileX: number = 0;
  @type('number')  tileY: number = 0;
  @type('number')  health: number = 100;
  @type('number')  maxHealth: number = 100;
}

export class GamePhaseState extends Schema {
  @type('string')  phase: string = 'lobby';  // lobby | claiming | combat | results
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

### Tile Claiming
- Players claim tiles by moving over unclaimed tiles or enemy tiles while in the `claiming` or `combat` phase — "over" meaning `pixelToHex(player.x, player.y)` lands on a valid hex
- Tile ownership stored as `ownerId` string in the flat `tiles` array
- On claim: update tile, increment player's `tilesOwned`, decrement the previous owner's if any
- `CollisionSystem` batches every tile claimed in a tick into a single `tilesClaimed` broadcast rather than one broadcast per tile
- Contested tiles (two players attempt same tile in same tick): resolved by iteration order over `state.players`, which is insertion order (join order) — **not** yet resolved by input `seq` as originally planned; revisit if this matters for fairness at 8-10 concurrent players

### Game Phases

| Phase | Description | Duration |
|---|---|---|
| `lobby` | Players join, ready up | Until host sends `startGame` |
| `claiming` | Players move, claim tiles | 90s |
| `combat` | PvP shooting enabled, structures can be placed/destroyed | 120s |
| `results` | Game over | 15s, then room disposed (no scoring/gameOver logic yet — see Networking Layer note) |

- Server owns all timers. `endsAt` is a server epoch timestamp (ms); client uses this for display countdown and corrects any local drift.
- `lobby` has no timer — the first player to join becomes `hostId`, and only that client's `startGame` message advances the phase. If the host is removed, `GameRoom.cleanupPlayer` promotes the next connected player — **but that only runs once the host's 3-minute reconnect window expires (or on a consented leave), not at the moment of disconnect** (see Current Status: known bug).
- Phase transitions broadcast a `phaseChanged` message with the new phase and `endsAt`.

### Movement

Movement is continuous, at **any angle**, and eased rather than snapping between headings.

- **Server (`MovementSystem`)**: each tick, the target velocity is `dir × PLAYER_SPEED` (`dir` clamped to length ≤ 1, with a small deadzone; magnitude scales speed, so an analog joystick can walk slowly). Actual velocity moves toward the target by at most `PLAYER_ACCEL × dt` (1200 px/s²) — the *same* limit applies when speeding up, stopping, and turning, so a full reverse takes a fraction of a second instead of flipping instantly. Then `position += velocity × dt`, clamped to the map rectangle (velocity is zeroed on the axis that hit the edge). `vx`/`vy` are synced so clients can extrapolate. Verified with a script: ramp to 200 px/s in ~4 ticks, headings ease from 45° to −73° over ~5 ticks, and a stop takes ~4 ticks.
- **Input is a world-space vector plus a facing angle**, so the server is agnostic to how the client derived it. The server keeps only the *latest* input per player (overwrite, not a queue).
- **Stale input is dropped.** If no input arrives for `INPUT_STALE_MS` (750ms) the player is treated as pressing nothing and coasts to a stop. Without this, a client that goes silent — a backgrounded browser tab pauses Phaser's loop, or the connection stalls — leaves the player running in their last direction indefinitely (found and fixed 2026-09-20). Clients therefore re-send at least every 250ms while active.
- **Desktop controls (client)**: the mouse *aims*; "forward" is toward the cursor. `W`/`S` move toward/away from it, `A`/`D` strafe (twin-stick style). `MOVE_RELATIVE_TO_AIM = false` in `client/src/game/constants.ts` switches to fixed screen-direction WASD with the mouse only aiming. **Mobile**: the joystick gives an on-screen vector that is `unproject`ed to world space, so the character moves where the stick points on screen; facing follows the movement direction.
- **Smoothness on the client**: see [Client — Phaser Game](#client--phaser-game) — rendered positions chase server state with frame-rate-independent smoothing plus a little velocity extrapolation. There is **no client-side prediction yet**, so your own input still takes about one round trip plus a server tick to show up (imperceptible on localhost, noticeable at 100ms+ latency). Prediction with reconciliation is the next step for latency hiding.

### PvP Shooting
- Client sends `shoot` message with an angle; server rejects it outside the `combat` phase or if the player is out of `ammo`
- Server spawns a `Projectile` in state at the shooter's current position, decrementing `ammo` by 1 — **there is currently no ammo regeneration or reload**, so a player can run out permanently within a match; add a regen tick or pickup mechanic before this ships
- `CombatSystem` advances all projectiles each tick, checks collision against players and structures, and removes projectiles on hit, out-of-bounds, or after `PROJECTILE_LIFETIME_MS` (tracked via `Projectile.spawnedAt`, not wall-clock elapsed time inferred from ticks)
- On a killing blow, the shooter's `kills` increments and the target **respawns** (full health, repositioned to map center) rather than being eliminated — this is a territory-claiming game, not a deathmatch, so matches don't end early from PvP alone
- Server broadcasts `playerHit` on every hit (not just kills); client should use this to play a hit effect

### Economy (Credits)
- Every player with `tilesOwned > 0` earns 1 credit per owned tile, once every `CREDIT_PAYOUT_INTERVAL_MS` (10s)
- `EconomySystem` runs only during `claiming`/`combat` — no payouts in `lobby` (no tiles are ownable yet) or `results` (match is already decided)
- Uses a wall-clock `GameState.nextPayoutAt` timestamp rather than counting ticks, so it stays correct if `TICK_RATE` ever changes — same pattern as `GamePhaseState.endsAt`
- No discrete broadcast event for a payout — `Player.credits` is a plain synced field, so clients see it update via the normal state delta, the same way `x`/`y`/`health` do
- Credits currently have no purpose beyond accruing (no spending, no scoring) — see [Planned Features #3](#planned-features) for the scoring formula that will consume them

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
if (status !== 'connected') return <ConnectPrompt />;      // idle / connecting / reconnecting / error
if (gameOver) return <ResultsSummary />;                     // gameOver event received
if (phase !== 'lobby') return <GameScreen />;                // claiming / combat / results
return <LobbyList />;                                        // phase === 'lobby'
```

`GameScreen` (`src/screens/GameScreen.tsx`) hosts the Phaser canvas plus the HUD, leaderboard, mobile joystick, and build-mode button — see [Client — Phaser Game](#client--phaser-game) for how those pieces fit together. There's no dedicated `MenuScreen`/standalone `LobbyScreen`/`ResultsScreen` component split yet (the lobby and results views are still inline in `App.tsx`); splitting those out is straightforward follow-up whenever `App.tsx` grows unwieldy, but wasn't necessary yet.

### URL-based Room Joining (not yet implemented)
- Room created via HTTP `POST /rooms` → server returns `{ roomId, shortCode }`
- Shareable URL: `https://yourgame.com/play/ABC123`
- On page load, client reads room code from URL path and auto-joins that room
- Server validates: room exists, not full, game not already in `combat` or `results` phase

---

## Client — Phaser Game

**Implemented 2026-09-20; lobby → claiming → movement/tile-claiming verified in a real browser the same day** (see [Real-browser pass](#real-browser-pass--2026-09-20-first-one); combat, structures, and mobile controls are still unexercised there). Build + typecheck + lint are clean. This deviates from the original sketch in a few ways worth calling out:

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

- **Isometric hex terrain**: three `Graphics` layers. (1) *Base* — every hex drawn once at scene create: cliff faces on the three lower edges (`HEX_DEPTH` px tall), then the top face and outline, tiles sorted back-to-front by center y so a nearer tile's top covers the face of the tile behind it. It never redraws. (2) *Claims* — the top face of each claimed hex tinted with its owner's color (`CLAIM_BLEND`), redrawn from `room.state.tiles` when a dirty flag is set (by `tilesClaimed`, or a player leaving — their tiles are released without an event), at most once per frame. (3) *Hover* — an outline of the hex under the mouse, which doubles as a visual check that pointer picking matches the drawn grid. Hex corner points are cached per tile (as `Vector2`s, which is what `Graphics.fillPoints` is typed for in Phaser 4). With uniform heights, cliff faces only show on the map edge; per-tile elevation would need the base layer split by height (see Planned Features).
- **Entity lifecycle**: `getStateCallbacks(room)`'s `onAdd`/`onRemove` on `players`/`projectiles`/`structures` create/destroy the corresponding Phaser game object. Existing entities at scene-create time are handled with one explicit `forEach`, since `onAdd` only fires for changes *after* the callback is registered — full state sent on join doesn't retroactively fire it.
- **Entity views and depth**: each entity remembers its smoothed *world* position (`wx`, `wy`); the Phaser object sits at `project(wx, wy)` with `setDepth(projectedY)` so things lower on screen draw in front. A player is a `Container` of a flattened shadow ellipse, a body circle lifted `BODY_LIFT` px off the ground, and a small "nose" dot on the facing direction (your own from local input so it never lags the mouse; others' from the synced `angle`). Projectiles float at body height; structures are boxes raised `STRUCTURE_LIFT`.
- **Smoothing**: `update()` reads `room.state` directly every frame (not through React) and moves each entity's world position toward `serverPosition + velocity × EXTRAPOLATION_S` by `1 − exp(−SMOOTHING_RATE × dt)` — exponential smoothing that's frame-rate independent, unlike the old fixed per-frame lerp. Jumps larger than `SNAP_DISTANCE` (a respawn) teleport instead of gliding across the map. Projectiles use the same chase with their `speed`/`angle` as the extrapolation.
- **Camera**: follows the local player's container (`startFollow`), bounded to the projected map size.
- **Input**: every frame the scene works out a *world-space* direction — from the joystick if active, otherwise from the keyboard (see [Movement](#movement) for the mouse-relative scheme) — and the current `aimAngle`. `updateAim()` recomputes the aim from the mouse each frame (`pointerToWorld`: camera scroll, then `unproject`) *even if the mouse hasn't moved*, because the camera moves under it; it's skipped for touch pointers. `sendInputIfChanged()` sends at most every `INPUT_SEND_INTERVAL_MS` (50ms), only when direction or angle changed, with a `INPUT_KEEPALIVE_MS` (250ms) resend so the server's stale-input cutoff never fires on an active player.
- **Shooting / building**: a pointer-down (mouse click or touch tap — Phaser unifies them) is `unproject`ed to a world point. It either fires toward that point (angle from the local player's world position) or — if `setBuildMode(true)` was called (wired to the React "Build" button in `GameScreen`) — places a structure on `pixelToHex(point)`, then turns build mode back off.

### Input — desktop and mobile share one message contract

Touch support needed no protocol changes, confirming what [Planned Features](#planned-features) predicted: `input`'s world-space `{x, y}` vector and `shoot`'s `angle` are input-method-agnostic. (The hex/mouse-aim work later added only the optional `angle` on `input`.)

- **Desktop**: mouse-aim + keyboard inside `GameScene`, above.
- **Mobile**: `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built from plain pointer events (no Phaser plugin dependency), rendered as a React overlay by `GameScreen` when `utils/device.ts`'s `isTouchDevice()` returns true. It reports the raw on-screen deflection (each axis clamped to `[-1, 1]`) to the active `GameScene` via `setJoystick()` — reached through `game.scene.getScene('GameScene')` from `GameScreen`, since the joystick is a React component with no direct reference to the Phaser scene. The scene converts it to a world-space direction each frame (undoing the iso squash, keeping the stick's strength as speed). Not yet exercised on a real touch device.

### HUD and Leaderboard — React overlays, not a Phaser UIScene

`client/src/components/HUD.tsx` and `Leaderboard.tsx` render on top of the Phaser canvas (absolutely positioned `<div>`s in `GameScreen`), reading from `GameContext` — the same reactive `players`/`phase`/`phaseEndsAt` state already used by the lobby screen. This avoids re-deriving Colyseus reactivity a second time inside Phaser: the HUD shows the local player's health/ammo/tiles/credits and the phase countdown; the leaderboard ranks all players (currently by `credits`, standing in for `score` until [Planned Features #3](#planned-features) lands).

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
CREATED ──► LOBBY ──► CLAIMING ──► COMBAT ──► RESULTS ──► DISPOSED
                          │              │
                    (phase timer)  (phase timer)
```

`LOBBY` → `CLAIMING` is the one transition that isn't timer-driven — it happens when the host's client sends `startGame` (see `GameRoom.handleStartGame`).

### Destruction Triggers
| Trigger | Action |
|---|---|
| `results` phase timer expires | Room disposed automatically |
| All players disconnect, reconnect windows all expire | Room disposed |
| Idle lobby (no activity for 10 min) | Room disposed by cleanup sweep |
| Host explicitly ends game | Phase set to `results`, then disposed |

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
player.connected = true again      promote a new host if needed (cleanupPlayer)
```

> Implementation note (Colyseus 0.16.5): there is a single `onLeave(client, consented)` hook, not the split `onDrop`/`onReconnect`/`onLeave` hooks a newer Colyseus line uses. `allowReconnection` is awaited directly inside `onLeave` when `!consented`: the `await` resolves if the client reconnects in time (Colyseus swaps the underlying connection back onto the same `Client`/session transparently — there's no separate `onReconnect` hook to mark `connected = true` in, so `GameRoom.onLeave` does it itself right after the `await` succeeds) and rejects once the window expires, which the `catch` block treats as the final departure. See the `GameRoom.ts` code under [Server — Colyseus](#server--colyseus). The `playerDisconnected`/`playerReconnected` broadcast events from the original design are **not implemented** — clients currently learn about connection state only via the `Player.connected` field's delta sync. On the client side, `GameConnection.ts`'s reconnection support (via `client.reconnect(token)`) is implemented and used automatically by `GameContext`'s retry loop on an unexpected drop — see [Client — React Shell](#client--react-shell).

### Reconnection Token
- Issued by Colyseus automatically on initial join (`room.reconnectionToken`)
- Client stores it in `sessionStorage` (persists across page refreshes in the same tab, cleared on tab close) — see `saveReconnectionToken`/`readReconnectionToken` in `client/src/net/GameConnection.ts`
- Presented automatically via `client.reconnect(token)`, tried first on every `connectToGame()` call if a token is stored; falls back to a fresh `joinOrCreate` if the token is rejected (expired, room gone, server restarted)

### Disconnect Behavior During Game
- Player entity remains on the map (frozen — no movement, no shooting; `MovementSystem`/`CombatSystem` both skip disconnected players)
- Frozen players are still valid targets (shooting them continues — `CombatSystem` doesn't check `connected` before applying hits)
- Their owned tiles are retained during the reconnect window
- Structures they placed remain active
- If the disconnecting player was the host, **the intended behavior is to promote the next connected player immediately, but the code currently only promotes in `cleanupPlayer`, i.e. after the reconnect window expires** — a disconnected host blocks `startGame` for up to 3 minutes (known bug, see Current Status)

---

## Collision Detection

**All collision detection runs server-side.** Client does no authoritative collision resolution.

### Projectile vs Player (Circle-Circle)
```typescript
// CollisionSystem.ts
function checkProjectilePlayerCollision(
  proj: { x: number; y: number },
  player: { x: number; y: number }
): boolean {
  const dx = proj.x - player.x;
  const dy = proj.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < PROJECTILE_RADIUS + PLAYER_RADIUS;
}
```

### Projectile vs Structure (hex containment)
A structure fills its whole hex, so a projectile hits it exactly when the projectile is inside that hex (this replaced an AABB check when the map moved from squares to hexes):
```typescript
function checkProjectileStructureCollision(
  proj: { x: number; y: number },
  structure: { tileX: number; tileY: number }
): boolean {
  const { col, row } = pixelToHex(proj.x, proj.y);
  return col === structure.tileX && row === structure.tileY;
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
- `getStateCallbacks(room)`'s reactive `onChange` proxy fires for a state change (tested via the `lobby` → `claiming` phase transition)
- `startGame` message advances the phase server-side and the client observes it
- `input` message is processed, movement applies, and the per-client `inputAck` message is received with the matching `seq`
- `tilesClaimed` broadcasts arrive during the `claiming` phase and `Player.tilesOwned` increments accordingly

This was a throwaway script (not checked into the client), but the same coverage should be re-run as a real test (or extended into one) any time either side's Colyseus/schema version changes, given how easy it is for a client/server pairing to silently break (see the two Tech Stack incidents this session).

### Real-browser pass — 2026-09-20 (first one)

Until this date the Phaser view had only been verified by typecheck/lint/headless scripts. Driving the Vite dev server (`vite`, port 5173 by default) against the live server in a browser confirmed:
- Lobby lists the joined player ("Player 1 (you)"); **Start Game** moves to `claiming` and the phase countdown ticks down.
- `GameScreen` renders: tile grid, the local player's circle centered on screen, HUD (phase/health/ammo/tiles/credits) top-left, leaderboard top-right.
- Keyboard movement claims tiles: `tilesOwned` went 1 → 28 during a short run, tiles are drawn in the player's color, and `credits` incremented on the 10s payout.

Not yet exercised in a browser: combat phase, shooting, structure placement/destruction, the mobile joystick and Build button, reconnection after a dropped socket or refresh, multiple simultaneous players, the `results`/game-over screen.

Debugging tips learned the hard way: (1) a blank page means check the browser console first — it was an uncaught provider error, not a build problem; (2) a page stuck on "connecting" with a successful `POST /matchmake/joinOrCreate/GameRoom` (200) in the network tab means the server failed while sending state — read the **server** log; (3) `EADDRINUSE` on 2567 means another server instance (often a `ts-node-dev` you forgot about) is already running; `ts-node-dev --respawn` also restarts itself on any file change, including `tsconfig.json`, so the port can briefly go down mid-session.

**Second pass — hex/isometric prototype (2026-09-20).** Confirmed: hex terrain renders as squashed flat-top hexes with the player's claimed hexes tinted in their color; the hover outline sits exactly on the hex under the cursor; holding `W` with the cursor to the lower right moved the player diagonally toward it, claiming a stepped line of hexes (9 tiles after ~2s of movement); a click in combat spent one ammo. The pass was cut short — the user was using the same dev server at the same time, which put both of us in one room — so structure placement, projectile visuals and the stale-input fix were not re-checked in the browser.

Testing notes from this pass: (1) synthetic key *taps* from browser automation are too short for a per-frame poll to see — dispatch `keydown`, wait, then `keyup` on `window` to simulate a held key; (2) an automation-driven pane can be backgrounded, which pauses Phaser's loop and stops input being sent — that is how the stale-input bug surfaced (the player kept walking after the key was released); (3) if you need a private room for testing while someone else uses the dev server, run a second server on another port (`PORT=2599 node dist/index.js`) and point a second Vite at it with `VITE_SERVER_URL=ws://localhost:2599`.

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
Bots are the most valuable local test tool now that client/server compatibility is confirmed (see the Live Client/Server Smoke Test above) — spin up 10 to stress-test tick performance, fuzz-test edge cases (concurrent tile claims, rapid connect/disconnect), and reproduce race conditions deterministically. Not yet built.

### Network Condition Simulation
- **Chrome DevTools** → Network tab → throttle individual tabs (100–300ms latency)
- **`clumsy`** (Windows) / **`tc qdisc`** (Linux) — OS-level latency, jitter, packet loss
- Test client-side prediction and reconciliation — bugs are invisible at 0ms latency

### Specific Scenarios to Test
| Scenario | What to verify |
|---|---|
| Two players claim same tile same tick | Currently resolved by player-map iteration order (join order), not input `seq` as originally planned — verify this is acceptable or revisit |
| Player disconnects mid-combat | Entity freezes, 3-min timer starts, tile ownership retained |
| Player reconnects within 3 min | Control restored, state consistent with what server held |
| Player reconnects after 3 min | Player gone, tiles released, clean state |
| Phase timer expires | Phase transitions correctly on all connected clients |
| Room with 0 active players | Room disposed cleanly, no memory leak |
| Full room (10 players) | 11th join rejected with clear error |
| Server kill mid-match | Clients handle dropped WS connection, show reconnecting UI |
| Host disconnects | **Currently fails**: promotion only happens after the 3-min reconnect window; expected: next connected player promoted immediately and can send `startGame` |
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

> The repo's config is **`tabWidth: 4`** (earlier drafts of this doc said 2), but most files written before the change are still 2-space, which is why `npm run format:check` flags many files. Files rewritten on 2026-09-20 (`hex.ts`, `GameScene.ts`, `MovementSystem.ts`, client `constants.ts`) are 4-space. Run `npm run format` in each of `client/` and `server/` once to make everything consistent — kept out of feature diffs on purpose so they stay readable.
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

_As of 2026-09-20 (after the hex/isometric prototype)._ Server and client both typecheck and lint clean, and the game runs end to end in a browser: join → lobby → start → mouse-aimed movement on an isometric hex map → tile claiming → credits → shooting. Nothing about teams, scoring, or the results flow has been built yet.

### Working (browser- or script-verified)
- Join/lobby, host `startGame`, phase timers, credits payout, HUD, leaderboard (browser).
- **Hex map + isometric rendering**: terrain draws correctly; the hover outline lands exactly on the hex under the mouse (picking matches the drawn grid); mouse-aimed `W` carries the player diagonally toward the cursor and claims a line of hexes; a click in combat fires a shot (ammo 30 → 29) (browser).
- Hex math round-trips exactly for all 4,096 tiles; velocity ramp/turn/decel numbers; off-map positions don't claim; stale input is dropped after 750ms (scripts).
- Reconnection token flow and the projectile/structure/phase server logic (scripts).

### Implemented but not yet exercised in a real browser
Projectile rendering in flight, structure placement (Build button) and destruction on the hex map, the mobile joystick and `unproject` conversion on a real touch device, reconnect after refresh/drop, multi-player sessions, the results screen, and the stale-input fix under a genuinely backgrounded tab.

### Known bugs / rough edges
- **Host is not promoted when the host disconnects.** The doc and intent say the next connected player becomes host immediately, but `GameRoom.onLeave` only marks the player disconnected and waits out the 3-minute reconnect window; promotion happens in `cleanupPlayer`, which runs only after that window (or on a consented leave). Effect: a room whose host's tab was closed or reloaded can't be started for up to 3 minutes. It bites during development because `joinOrCreate` puts every new tab into the same lobby room, so a leftover frozen "Player 1" keeps the host role. Fix: promote inside `onLeave` as soon as `connected` goes false.
- **Layout overflow:** the game page shows both horizontal and vertical scrollbars and the leaderboard is clipped at the right edge — the Phaser canvas and/or overlay container is larger than the viewport. Likely `#root`/`App.css` (Vite template styles: `#center`, body margins) interacting with `Phaser.Scale.RESIZE`. Not investigated.
- **No client-side prediction.** Rendering is smoothed and extrapolated, but your own movement still waits for the server round trip (see Movement). Fine on localhost; needs work before real-world latency.
- **Map corners aren't hex-covered:** movement is clamped to the map rectangle, but the hex edge is jagged, so a player can stand over no hex (claiming ignores it).
- **Everything is one height:** the reference art has elevation, cliffs, water and mountains; the prototype has a single flat height, so cliff faces show only on the map edge. Structures are plain boxes and players are circles.
- **Ammo never regenerates** (30 shots for the whole match) — see PvP Shooting.
- **No reconnect retry cap/backoff** in `GameContext`.
- **Client bundle ~1.7MB** (Phaser) — Vite chunk-size warning, no code-splitting yet.
- **Mobile:** no dedicated fire button; no responsive tuning for phone-width screens.
- **`playerDisconnected`/`playerReconnected`/`gameOver` server events are not wired**, though the client has handlers for them; `results` phase currently does nothing but wait out its timer.
- **Contested tile claims** resolve by player join order, not input `seq`.
- **Prettier config vs. code style mismatch** (config says 4-space; most older files are 2-space) — see Build Tooling. `format:check` flags many files until someone runs `npm run format`.
- **Node version is not enforced** (no `.nvmrc` / `engines`) — see Tech Stack.
- **Dev-server restarts drop every room.** `ts-node-dev --respawn` restarts on any file change (including `tsconfig.json` and a plain `touch`), which wipes in-memory rooms and disconnects clients mid-game. Expected, but surprising when two people share one dev server.

### Open questions and ideas (from `dev-notes.md` and the reference art)
1. **Should the project move off Colyseus?** Raised because of the repeated client/server compatibility problems (see Tech Stack items 1–5). Not decided. Considerations: the published `colyseus.js` client tops out at 0.16.22, so the server is stuck on the 0.16 line with exact pins; the pain so far has been version/config drift rather than fundamental design limits, and everything is now working and verified on the pinned versions. Alternatives (raw `ws` + own delta sync, or another framework) would mean re-implementing rooms, delta-compressed state sync, and reconnection.
2. **Starting positions:** players should start in a line on the right side of the map to simulate "going west". Today every player spawns at the exact map center (`GameRoom.onJoin`, and `CombatSystem` respawns to center). Needs a spawn-slot scheme for up to 10 players (spawn hexes along the right edge) and a decision on whether respawns also use it.
3. **Is terrain gameplay or decoration?** The reference image shows water, mountains and cliffs. If they block movement or projectiles, `Tile` needs a terrain (and maybe height) field and `MovementSystem`/`CombatSystem` need rules for it; if decoration, it can stay client-only art. See Planned Features #7.

---

## Planned Features

Captured 2026-09-20 as design ideas; the Phaser game view work session that followed (also 2026-09-20) implemented several of them along the way. Status is marked per item below — see the Decisions Log for what changed and why.

### 1. Credits (economy) — ✅ implemented

- `Player.credits: number` (synced schema field) and `GameState.nextPayoutAt: number` (server timestamp of the next payout, same pattern as `GamePhaseState.endsAt`).
- `server/src/systems/EconomySystem.ts`: every `CREDIT_PAYOUT_INTERVAL_MS` (10s, in `constants.ts`), every player with `tilesOwned > 0` gets `credits += tilesOwned`. Runs only during `claiming`/`combat` — payouts stop once `results` begins, per the open question raised when this was planned.
- Wired into `GameRoom.tick()` alongside the other systems; `nextPayoutAt` is initialized in `onCreate()`.
- Verified live: a throwaway script joined, claimed tiles, waited 11s, and confirmed `credits` incremented by exactly `tilesOwned` after one payout cycle.

### 2. Teams — not yet implemented

- New schema: `GameState.teams: MapSchema<Team>`, where `Team` has `id`, `color`, and (if credits are pooled — see below) `credits`. `Player` gets a `teamId: string` field (empty string = free-for-all/no team, same convention as `Tile.ownerId`).
- **Tile ownership needs a real decision here.** Today `Tile.ownerId` stores a player's `sessionId`. "Tiles all belong to the team" means either: (a) keep `Tile.ownerId` as the *player* id but always render/derive tile color from `player.teamId`'s team color, treating individual claims as team-attributed; or (b) change `Tile.ownerId` to store the *team* id directly once teams are active, so any teammate's presence claims for the team as a single pool. (b) is closer to what's described ("teammate's tiles all belong to the team") and simpler for `CollisionSystem`'s claim logic (no per-player tile counts to reconcile within a team), but it's a real schema/logic change, not just a rendering tweak — decide before implementing.
- Credits: either **pooled at the team level** (one `Team.credits`, split only at scoring time or spendable as a shared pool) or **distributed evenly to each teammate's own `Player.credits`** every payout tick. The request says "credits are distributed evenly between teammates," which reads as the latter — `EconomySystem` would compute `teamTiles / teamSize` per payout and credit each connected teammate that amount (need a rounding/remainder rule for team sizes that don't divide evenly). Note `EconomySystem` currently pays each player individually based on their own `tilesOwned` — that logic will need to branch on whether teams are active.
- Friendly fire: `CombatSystem.checkProjectilePlayerCollision` (or wherever the hit is applied) needs an early-out when `shooter.teamId !== '' && shooter.teamId === target.teamId`. Same idea for structures: `handlePlaceStructure`'s occupancy check already prevents overlap, but damaging/destroying needs a same-team guard added to whatever resolves projectile-vs-structure hits.
- Open question: how are teams formed? Not designed yet — options are a lobby team-select UI (host or self-assign before `startGame`), auto-balancing on join, or a `joinTeam`/`leaveTeam` message during the `lobby` phase. Needs a decision before the client lobby screen can be built out.

### 3. Win condition / Scoring — not yet implemented

- **Match length: 5 minutes to start** (make it configurable — a constant, not hardcoded, since the request already flags 5–10 min as a range to tune). Today's phase durations (`claiming` 90s + `combat` 120s = 210s ≈ 3.5 min) don't add up to 5 minutes on their own, so this needs a decision: either (a) lengthen `combat` so `claiming + combat ≈ 300s`, or (b) decouple "match length" from "phase length" entirely — give `GameState` a `matchEndsAt` (set once, at `startGame`) separate from `phase.endsAt`, and have `PhaseSystem` force an early transition to `results` once `Date.now() >= matchEndsAt`, regardless of which phase is active. (b) is more flexible (lets `claiming`/`combat` loop or vary in length later without re-deriving "5 minutes") and is the recommended approach.
- Scoring formula: `score = credits × pointsPerCredit + Σ(structure count × its point value)`.
  - Structure point values: **city hall 1000, school 250, house 100, fort 25.** This means `Structure` needs a `type` field it doesn't have today (`'cityHall' | 'school' | 'house' | 'fort'`), a `STRUCTURE_POINTS` lookup in `constants.ts`, and the `placeStructure` message needs a `structureType` field added (today it's just `{ tileX, tileY, seq }`) plus whatever client UI lets a player pick a type before placing — the `GameScene`'s build-mode tap-to-place flow (see [Client — Phaser Game](#client--phaser-game)) would need a type picker added before this can be wired up.
  - `pointsPerCredit` value is not yet chosen — placeholder constant, tune during playtesting.
  - Implies a `Player.score` (or `Team.score`) field, recomputed on payout and on structure build/destroy events rather than every tick (score only changes on those events, so no need to recompute per-tick).
- Win condition: at match end (`matchEndsAt` reached), highest score wins — player-level in free-for-all, team-level (sum or average of teammates' scores — decide which) if teams are active. Tie-breaking is not addressed yet — flag for later.
- The Leaderboard (#5, below) currently sorts by `credits` as a stand-in, since `score` doesn't exist yet — swap the sort key once it does.

### 4. HUD (credits + score) — ✅ implemented (credits; score pending #3)

`client/src/components/HUD.tsx` — a React overlay (not a Phaser `UIScene`; see [Client — Phaser Game](#client--phaser-game) for why) rendered on top of the Phaser canvas by `GameScreen`. Shows the current phase and countdown, and the local player's health, ammo, tiles owned, and credits. Score will slot in next to credits once #3 exists.

### 5. Leaderboard / player-status info panel — ✅ implemented

`client/src/components/Leaderboard.tsx` — a React overlay listing every player, sorted by `credits` descending (a stand-in for `score` until #3 lands), showing tiles/kills/connection status too. Needs no server changes beyond the fields it already reads — it's driven entirely by `GameContext`'s existing reactive `players` array.

### 6. Mobile web controls — ✅ implemented

- `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built with pointer events (not a Phaser plugin), reporting the on-screen stick deflection. `GameScreen` shows it when `utils/device.ts`'s `isTouchDevice()` check passes, and it feeds `GameScene.setJoystick()`, which converts it to a world-space direction and sends it through the same throttle/dedupe path the keyboard uses (see [Client — Phaser Game](#client--phaser-game)) — no separate server-side handling needed, confirming the original prediction that the existing `input`/`shoot` message shapes already supported this.
- Shooting and structure-placement are tap-driven in `GameScene` itself (a tap shoots toward the tap point; a "Build" button arms one-shot placement mode for the next tap) — the same handlers serve both mouse and touch, since Phaser's pointer events unify them.
- Not yet done: a dedicated fire button (tap-to-shoot doubles as both aim and fire today, which is serviceable but not necessarily the best mobile feel — worth revisiting during playtesting) and responsive layout tuning for small screens (the HUD/leaderboard positioning hasn't been tested at phone width yet).

### 7. Terrain, elevation, and real art — not implemented

Driven by reference art showing hex tiles with mountains, trees, water and cliff faces. Prototype status: one flat height, primitive shapes, no terrain.
- **Decide first** whether terrain is gameplay (blocks movement/projectiles, maybe unclaimable — needs `Tile.terrain`/`Tile.height` in the schema and rules in `MovementSystem`/`CombatSystem`/`CollisionSystem`) or purely visual (client-only art keyed off a seeded map, no protocol change).
- **Rendering with elevation:** the static base layer must draw tiles back-to-front with each tile's cliff height, so heights vary per tile; tall props (mountains, trees, structures) need depth sorting against players using `setDepth(projectedY)` like entities already do. Keep the top-down world as the source of truth and add height only as a render offset.
- **Art:** the reference image is AI-generated (watermarked, irregular tile shapes, unclear licensing) — treat it as mood only. Real tiles need a consistent hex footprint (64 × ~55 px top at the current size/squash, plus cliff height) so sprites tile cleanly; sprites replace `GameScene`'s primitives without an architecture change (needs a preload step, since the scene currently loads nothing).
- **Map shape:** the jagged hex edge vs. rectangular movement bounds (see Known Issues) is worth fixing at the same time, e.g. by clamping to the nearest valid hex.

### 8. Client-side prediction — not implemented

Simulate the local player with the same acceleration model as `MovementSystem` (share the step function between client and server), replay unacknowledged inputs against each authoritative update (the `seq`/`inputAck` plumbing already exists for this), and correct smoothly. Do this once latency is a real concern; the extrapolation/smoothing already in place hides tick-rate stepping but not round-trip delay.

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
| Host concept | First player to join a room is `hostId`; only they can send `startGame`; reassigned to next connected player on host departure | No host (auto-start at max players or after a lobby timer), server-side matchmaking-assigned host | Simplest to implement for a scaffold; a lobby timer or player-ready-up voting could replace this later without changing the wire protocol much |
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
| Credits payout scope | Every player earns 1 credit per tile they individually own, during `claiming`/`combat` only | Payouts continuing into `results`, or scoped only to `combat` | Matches the request's "based on number of tiles they control" without over-scoping into phases where tile ownership isn't changing meaningfully or the match is already decided; open questions about team-pooled credits remain in Planned Features #2 |
| Pinning `@colyseus/core` | Exact-pin all four Colyseus packages (`colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5), no `^` | Leave `@colyseus/core` to resolve as a peer dependency | It is only a peer of `colyseus`/`ws-transport`, so an unpinned install resolved it to 0.18.14, whose `Room` generics and `onLeave` signature are incompatible with 0.16 and broke `tsc`. Exact pins plus a lockfile regenerated from a clean install prevent silent drift (2026-09-20) |
| Publishing the room to React | `GameContext.connect()` waits for the first state (`onStateChange.once`) before `setRoom`/`setStatus('connected')` | Publish the room as soon as `joinOrCreate` resolves and null-check `state` everywhere | The join promise resolves before the initial full-state message is decoded, so `room.state.phase` is undefined at that moment. Waiting once at the boundary lets every consumer assume populated state |
| `<GameProvider>` placement | Wrap `<App />` in `main.tsx` | Provide the context lower in the tree, or make `useGameConnection()` tolerate a missing provider | `App` itself consumes the context, so the provider must sit above it. Missing it gave a fully blank page with only a console error; the hook's throw is intentional, since it surfaces the mistake immediately |
| Version-drift guardrails | Document exact pins and the "run a real client against a real server" check; `.nvmrc`/`engines` not yet added | Trust isolated build/lint passes | Three of the five compatibility bugs to date (the matchmake protocol mismatch, the `useDefineForClassFields` encode crash, and that setting missing from the committed `tsconfig.json`) passed every per-side build/lint check and surfaced only when a real client joined a real server; the other two (`@colyseus/core` peer drift, `index.ts` on the 0.18 API) were caught by `tsc`. Separately, a Node 13 default shell can't run TS 6 at all |
| Whether to leave Colyseus | **Undecided** — staying on pinned 0.16.x for now | Raw `ws` + custom sync; another framework | Raised in `dev-notes.md` because of the compatibility churn. Everything works and is verified on the pinned versions, and replacing rooms/delta sync/reconnection is a large cost; revisit if the 0.16 line's lack of updates or a needed feature becomes a real blocker |
| Git workflow | The user runs all git commands; Claude edits files and asks the user to commit | Claude commits/pushes | Stated preference in `CLAUDE.md` — the user wants to review what's being committed |
| Map grid | Flat-top hexes, odd-q offset, stored in the same flat array (`row * cols + col`); axial/cube coordinates used only inside `pixelToHex` | Keep square tiles; pointy-top; axial storage | Hexes are the intended design. Odd-q keeps the map rectangular and the schema/array unchanged, and flat-top matches the reference art. Only tile lookup, structure hits, bounds and rendering had to change — claiming is by position, not adjacency, so this was cheap to do before teams/structure types |
| Isometric implementation | Render-only vertical squash (`ISO_SQUASH = 0.6`) of a top-down world; server never sees it | True 45° isometric projection; simulating in screen space | A single scale factor gives the ~2:1 hex look of the reference, keeps server hex/collision/movement simple, and inverts trivially. The cost — every pointer/joystick vector must be `unproject`ed before use — is confined to `GameScene` |
| Movement model | Acceleration-limited velocity (`PLAYER_ACCEL`), world-space input vector (magnitude = speed) + facing angle | Instantly setting velocity from the input (previous behavior); stepping tile to tile | Smooth start/stop/turn at any angle and analog joystick speed, with a server change only in `MovementSystem`. `vx`/`vy`/`angle` are synced so clients can extrapolate and draw facing |
| Desktop controls | Mouse aims; `W`/`S` toward/away from cursor, `A`/`D` strafe (`MOVE_RELATIVE_TO_AIM`, switchable) | Fixed screen-direction WASD with mouse-only aiming | Requested "mouse looks, forward follows it" feel. Aim is recomputed every frame because the camera moves under a still mouse |
| Stale input | Server discards input older than `INPUT_STALE_MS` (750ms); client keeps alive every 250ms | Trust the last input indefinitely (previous behavior) | A backgrounded tab pauses Phaser's loop, so "key released" never got sent and the player ran on forever. Any silent client (tab hidden, network stall) now coasts to a stop |
| Client smoothness | Frame-rate-independent exponential smoothing toward `state + velocity × EXTRAPOLATION_S`; snap on large jumps | Fixed per-frame lerp (previous); full client-side prediction now | Hides the 20Hz tick stepping at any frame rate for little code. Prediction/reconciliation is deferred (Planned Features #8) until latency actually matters |
| Hex rendering | Three `Graphics` layers: static base (drawn once), claims tint (dirty-flag redraw, claimed hexes only), hover outline | One `Graphics` redrawn on every `tilesClaimed`; one game object per tile | `tilesClaimed` fires nearly every tick while moving; redrawing 4,096 hexes with cliff faces each time was the expensive path. Only the small claims layer redraws |
| Structure hit test | Projectile is inside the structure's hex (`pixelToHex` equality) | Circle or AABB approximation of a hex | Exact for a structure that fills its whole hex, and no extra geometry |
