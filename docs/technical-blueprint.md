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
16. [Planned Features](#planned-features)
17. [Decisions Log](#decisions-log)

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Server runtime | Node.js | Battle-tested, large ecosystem |
| Server framework | Colyseus (`colyseus` ^0.16.5, `@colyseus/schema` ^3.0.76) | Built-in rooms, delta sync, reconnection |
| Server language | TypeScript | Shared types with client |
| Client framework | React 18 | Component-based UI shell (menus, lobby) |
| Client language | TypeScript | Type safety, shared types with server |
| Game rendering | Phaser 3 | 2D canvas, tile grid, particles, animations |
| Bundler (client only) | Vite | Fast HMR, zero-config TS + React. **Not used server-side** — the server builds with plain `tsc` and runs dev with `ts-node-dev`; Vite is a browser-facing dev server/bundler and doesn't apply to a Node backend. |
| Linting | ESLint 10 (flat config) + Prettier | Code quality and formatting, same toolchain shape for client and server |
| WebSocket protocol | Colyseus protocol (over ws) | Handles framing, delta compression |

> **Verified 2026-09-19, end-to-end:** client and server both build, lint, format-check, and boot cleanly against the dependency versions above, and a live client (`colyseus.js@0.16.22`) has successfully joined the server, decoded full state, sent inputs, received `inputAck`/broadcast messages, and observed reactive state changes. This required two rounds of correction from an earlier draft of this doc — see the Decisions Log for the full story:
>
> 1. **The server was briefly on `colyseus@^0.18` / `@colyseus/schema@^5.0`, and no compatible client exists for that line.** `colyseus.js` (the published npm client) tops out at `0.16.22`, which bundles `@colyseus/schema@3.0.76`. A direct `curl` comparison of the two versions' `/matchmake/joinOrCreate/GameRoom` HTTP responses confirmed a genuine, previously-undocumented wire-protocol break: 0.18 returns a flat `{name, sessionId, roomId, processId}`, while the 0.16.x client expects a nested `{room: {...}, sessionId}` — this is **not** just a schema-decoding concern (which is reflection-based and more forgiving across minor versions), it's the matchmaking handshake itself. **Fix:** downgraded the server to `colyseus@0.16.5` + `@colyseus/schema@^3.0.76`, matching the only published client exactly. Do not bump either side independently without re-running a live join/decode test.
> 2. **After the downgrade, the server crashed on every client join** with `TypeError: Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')` inside `@colyseus/schema`'s encoder. Root cause: `tsconfig.json`'s `target: "ES2022"` makes TypeScript default `useDefineForClassFields` to `true`, which compiles class-field initializers (`id = '';` etc.) to `Object.defineProperty` semantics in the constructor. That silently **overwrites** the accessor that `@colyseus/schema`'s legacy `@type()` decorator installs on the prototype — the classic "class fields + legacy decorators" footgun. **Fix:** added `"useDefineForClassFields": false` to the server's `tsconfig.json` (see [Build Tooling](#build-tooling)) so field initializers compile to plain constructor assignments instead, letting the decorator's accessor actually run.
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
│  │  │         Phaser 3 Instance          │  │   │
│  │  │  GameScene: renders state, inputs  │  │   │
│  │  │  UIScene: overlays, health bars    │  │   │
│  │  └────────────────────────────────────┘  │   │
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
│   │   ├── constants.ts            # Shared tunables (tick rate, tile size, speeds, damage, etc.)
│   │   ├── rooms/
│   │   │   └── GameRoom.ts         # Colyseus room — lifecycle, message handlers, tick loop
│   │   ├── state/
│   │   │   └── GameState.ts        # Colyseus schema definitions
│   │   ├── systems/
│   │   │   ├── Broadcast.ts        # Shared callback type systems use to emit discrete events
│   │   │   ├── MovementSystem.ts   # Input processing, position updates
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
│   │       ├── constants.ts        # Client-side render constants mirroring server/src/constants.ts
│   │       └── scenes/
│   │           └── GameScene.ts    # Tiles, players, projectiles, structures, camera, input — see Client — Phaser Game
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── eslint.config.js            # ESLint 10 flat config (browser globals + React)
│   ├── .prettierrc.json
│   ├── .prettierignore
│   └── package.json
│
└── docs/
    └── technical-blueprint.md      # This document
```

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
// Player movement input
{ type: "input", dir: { x: number, y: number }, seq: number }

// Player shoots
{ type: "shoot", angle: number, seq: number }

// Place structure
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
import { TICK_RATE, TILE_SIZE, RECONNECT_WINDOW_SECONDS, CREDIT_PAYOUT_INTERVAL_MS } from '../constants';
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
    player.x = (this.state.mapWidth * TILE_SIZE) / 2;
    player.y = (this.state.mapHeight * TILE_SIZE) / 2;
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

    // Clamp so a buggy/malicious client can't move faster than PLAYER_SPEED.
    const dir = {
      x: Math.max(-1, Math.min(1, msg.dir?.x ?? 0)),
      y: Math.max(-1, Math.min(1, msg.dir?.y ?? 0)),
    };
    this.playerInputs.set(client.sessionId, { dir, seq: msg.seq });
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

    const idx = msg.tileY * this.state.mapWidth + msg.tileX;
    const tile = this.state.tiles[idx];
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

### Tile Claiming
- Players claim tiles by moving over unclaimed tiles or enemy tiles while in the `claiming` or `combat` phase
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
- `lobby` has no timer — the first player to join becomes `hostId`, and only that client's `startGame` message advances the phase. If the host disconnects, `GameRoom.onLeave` promotes the next connected player.
- Phase transitions broadcast a `phaseChanged` message with the new phase and `endsAt`.

### Movement
- Continuous movement — clients send a direction vector each tick via the `input` message
- `MovementSystem` normalizes the direction vector (so diagonal movement isn't faster than cardinal movement), applies `velocity × deltaTime`, and clamps to map bounds
- The server keeps only the *latest* input per player (overwrite, not a queue) — appropriate for continuous movement, not for discrete/turn-based actions
- Client-side prediction: client simulates own movement locally for responsiveness, corrects on server update (not yet implemented client-side)

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

**Implemented and verified 2026-09-20** (build + typecheck + lint clean; the underlying game-state decode/message path is the same one covered by the live smoke tests under [Testing Multiplayer Locally](#testing-multiplayer-locally)). This deviates from the original sketch in a few ways worth calling out:

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

- **Tile grid**: a single `Graphics` object, redrawn on the `tilesClaimed` broadcast (and once on scene create) — not every frame. Tile color is derived from the owning player's `color` field (`Tile` itself doesn't store a color).
- **Entity lifecycle**: `getStateCallbacks(room)`'s `onAdd`/`onRemove` on `players`/`projectiles`/`structures` create/destroy the corresponding Phaser game object. Existing entities at scene-create time are handled with one explicit `forEach`, since `onAdd` only fires for changes *after* the callback is registered — full state sent on join doesn't retroactively fire it.
- **Position rendering**: `update()` reads `room.state` directly every frame (not through React, and not through reactive callbacks) and lerps each sprite toward the live server position (`POSITION_LERP_FACTOR = 0.25`) — this is the "read state directly each frame" approach flagged as the plan in [Client — React Shell](#client--react-shell).
- **Camera**: follows the local player's circle (`cameras.main.startFollow`), bounded to the map's pixel dimensions.
- **Input**: keyboard (arrows + WASD) is polled every frame in `update()` and sent via `sendInputIfChanged()`, which only re-sends when the direction actually changes (or every 250ms as a keep-alive, in case a packet drops) rather than flooding the server every frame. The same `sendInputIfChanged()` method is called externally by the mobile joystick overlay (see below), so both input paths share one throttle/dedupe implementation.
- **Shooting / building**: a pointer-down (works for both mouse clicks and touch taps — Phaser unifies them) either fires toward the tapped world point, or — if `setBuildMode(true)` was called (wired to the React "Build" button in `GameScreen`) — places a structure on the tapped tile instead, then automatically turns build mode back off.

### Input — desktop and mobile share one message contract

No server changes were needed for touch support, confirming what [Planned Features](#planned-features) predicted: `input`'s `{x, y}` vector and `shoot`'s `angle` are already input-method-agnostic.

- **Desktop**: keyboard polling inside `GameScene`, above.
- **Mobile**: `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built from plain pointer events (no Phaser plugin dependency), rendered as a React overlay by `GameScreen` when `utils/device.ts`'s `isTouchDevice()` returns true. It computes the same `{x, y}` shape (each axis clamped to `[-1, 1]`) and calls into the active `GameScene` instance's `sendInputIfChanged()` — reached via `game.scene.getScene('GameScene')` from `GameScreen`, since the joystick is a React component with no direct reference to the Phaser scene.

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
- If the disconnecting player was the host, `onLeave` promotes the next connected player immediately (doesn't wait for the reconnect window)

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

### Projectile vs Structure (AABB)
Each structure occupies one tile (grid-aligned box):
```typescript
function checkProjectileStructureCollision(
  proj: { x: number; y: number },
  structure: { tileX: number; tileY: number }
): boolean {
  const sx = structure.tileX * TILE_SIZE;
  const sy = structure.tileY * TILE_SIZE;
  return (
    proj.x > sx && proj.x < sx + TILE_SIZE &&
    proj.y > sy && proj.y < sy + TILE_SIZE
  );
}
```

### Tile Claiming (Grid)
Player position → floor to tile coordinates → check tile ownership; every claim this tick is collected into one batched `tilesClaimed` broadcast:
```typescript
function claimTile(state: GameState, player: Player, claimed: TilesClaimedEvent['tiles']) {
  const tileX = Math.floor(player.x / TILE_SIZE);
  const tileY = Math.floor(player.y / TILE_SIZE);
  const idx = tileY * state.mapWidth + tileX;
  const tile = state.tiles[idx];
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
| Host disconnects | Next connected player promoted to host, can still send `startGame` |
| Player runs out of ammo | Shots are rejected server-side; no regen yet, so this is currently permanent for the rest of the match |

---

## Build Tooling

### Setup Commands

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
npm install colyseus@0.16.5 @colyseus/schema@^3.0.76 @colyseus/ws-transport@^0.16.5 express cors
npm install --save-dev typescript@~6.0.2 @types/node @types/express @types/cors ts-node-dev \
  eslint @eslint/js typescript-eslint globals \
  prettier eslint-config-prettier
```

> `typescript-eslint` currently requires TypeScript `<6.1.0` as a peer dependency — pin `typescript@~6.0.2` explicitly on both client and server if `npm install` resolves a newer TypeScript 7.x and the peer-dependency install fails.
>
> **Pin `colyseus`/`@colyseus/schema` to the versions above explicitly** (`npm install colyseus` unpinned will resolve to a newer line, e.g. 0.18, that has no published compatible `colyseus.js` client — see the Tech Stack compatibility note). `npm install colyseus.js` on the client resolves to `0.16.22`, which is the verified-compatible pairing for these server versions.

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
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
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

- `client/src/components/MobileJoystick.tsx` — a drag-based virtual joystick built with pointer events (not a Phaser plugin), producing the same `{x, y}` direction vector shape the keyboard path does. `GameScreen` shows it when `utils/device.ts`'s `isTouchDevice()` check passes, and it feeds into the same `GameScene.sendInputIfChanged()` throttle/dedupe path the keyboard uses (see [Client — Phaser Game](#client--phaser-game)) — no separate server-side handling needed, confirming the original prediction that the existing `input`/`shoot` message shapes already supported this.
- Shooting and structure-placement are tap-driven in `GameScene` itself (a tap shoots toward the tap point; a "Build" button arms one-shot placement mode for the next tap) — the same handlers serve both mouse and touch, since Phaser's pointer events unify them.
- Not yet done: a dedicated fire button (tap-to-shoot doubles as both aim and fire today, which is serviceable but not necessarily the best mobile feel — worth revisiting during playtesting) and responsive layout tuning for small screens (the HUD/leaderboard positioning hasn't been tested at phone width yet).

---


## Decisions Log

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| Server framework | Colyseus | raw `ws`, uWebSockets.js | Built-in delta sync, reconnection, room management |
| Server runtime | Node.js | Deno, Bun | Most mature; best ecosystem for Colyseus |
| Server scaling | Single Node instance | Redis pub/sub, multi-instance | Sufficient at target player count (≤10/room) |
| Client rendering | Phaser 3 | Three.js, plain Canvas | 2D-optimized, tile grid support, particle effects |
| Client UI framework | React 18 | Lit.js, vanilla JS | Familiarity goal; good component model for lobby/menus |
| Client bundler | Vite (client only) | Webpack, Parcel | Fast HMR, zero-config TS+React, modern standard. Server does **not** use Vite — plain `tsc` build + `ts-node-dev` for hot reload, since Vite targets browser bundling |
| Transport protocol | WebSockets (via Colyseus) | WebRTC, SSE, polling | Right latency profile; server-authoritative; P2P not needed at this scale |
| Collision detection | Home-rolled distance/AABB | Rapier, Planck.js, P2.js | Sufficient complexity; physics engine is overkill for this game type |
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
