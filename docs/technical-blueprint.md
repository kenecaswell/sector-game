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
16. [Decisions Log](#decisions-log)

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Server runtime | Node.js | Battle-tested, large ecosystem |
| Server framework | Colyseus (`colyseus` ^0.18, `@colyseus/schema` ^5.0) | Built-in rooms, delta sync, reconnection |
| Server language | TypeScript | Shared types with client |
| Client framework | React 18 | Component-based UI shell (menus, lobby) |
| Client language | TypeScript | Type safety, shared types with server |
| Game rendering | Phaser 3 | 2D canvas, tile grid, particles, animations |
| Bundler (client only) | Vite | Fast HMR, zero-config TS + React. **Not used server-side** — the server builds with plain `tsc` and runs dev with `ts-node-dev`; Vite is a browser-facing dev server/bundler and doesn't apply to a Node backend. |
| Linting | ESLint 10 (flat config) + Prettier | Code quality and formatting, same toolchain shape for client and server |
| WebSocket protocol | Colyseus protocol (over ws) | Handles framing, delta compression |

> **Verified 2026-09-19:** client and server scaffolds both build, lint, format-check, and boot cleanly against the dependency versions above. Where this doc's earlier draft assumed an older Colyseus API (a single `colyseus` package with `new Server({ server: httpServer })`, `Room<GameState>`, and `onLeave(client, consented)`), the code below reflects the version actually installed and confirmed working.

> **⚠️ Client compatibility blocker, found 2026-09-19 while starting the client's `GameContext`:** the published `colyseus.js` client tops out at `0.16.22`, which depends on `@colyseus/schema@^3.0.0` — but the server is on `@colyseus/schema@^5.0.33`. Major-version schema mismatches are a real wire-protocol risk (v5 changed the decorator API and internals significantly from v3; the delta-encoding format is not guaranteed compatible). **Before writing `GameContext.tsx` or any client networking code, resolve this**, e.g. by: (a) checking whether a `colyseus.js` `next`/`preview` dist-tag has caught up to 0.18 by the time client work starts (`npm view colyseus.js dist-tags`), (b) downgrading the server to a `colyseus`/`@colyseus/schema` line that has a matching published client, or (c) checking the Colyseus GitHub/Discord for the currently-recommended client package for the 0.18 server line. Don't assume `npm install colyseus.js` "just works" against this server without verifying the schema major version matches first.

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
│   │   │   └── PhaseSystem.ts      # Phase transitions, timer management
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
│   │   ├── main.tsx                # Vite entry point
│   │   ├── App.tsx                 # Screen router
│   │   ├── contexts/
│   │   │   └── GameContext.tsx     # Colyseus client, room state, screen state
│   │   ├── screens/
│   │   │   ├── MenuScreen.tsx      # Create/join room
│   │   │   ├── LobbyScreen.tsx     # Player list, ready up, start game
│   │   │   ├── GameScreen.tsx      # Phaser instance host
│   │   │   └── ResultsScreen.tsx   # Post-game scores
│   │   ├── hooks/
│   │   │   └── useGameConnection.ts # Custom hook for Colyseus room actions
│   │   ├── game/
│   │   │   ├── PhaserGame.ts       # Phaser.Game config and init
│   │   │   ├── scenes/
│   │   │   │   ├── GameScene.ts    # Main scene: tiles, players, projectiles
│   │   │   │   ├── UIScene.ts      # HUD overlay (health, phase timer, scores)
│   │   │   │   └── PreloadScene.ts # Asset loading
│   │   │   ├── systems/
│   │   │   │   ├── TileRenderer.ts     # Tile grid rendering + ownership colors
│   │   │   │   ├── PlayerRenderer.ts   # Player sprites, interpolation
│   │   │   │   ├── ProjectileRenderer.ts # Visual projectile trails
│   │   │   │   └── StructureRenderer.ts  # Structure sprites, damage states
│   │   │   └── input/
│   │   │       └── InputHandler.ts # Keyboard/mouse input → server messages
│   │   └── types/
│   │       └── shared.ts           # Copy of server/src/types/shared.ts
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

> The `colyseus` 0.18 API is meaningfully different from older tutorials (which target ~0.14–0.15). The differences that matter here:
> - `Room` is generic over an options bag, not the state class directly: `Room<{ state: GameState }>`, not `Room<GameState>`.
> - The old single `onLeave(client, consented: boolean)` hook is now three hooks: `onDrop(client, code?)` (unconsented disconnect — call `allowReconnection` here), `onReconnect(client)` (successful reconnect), and `onLeave(client, code?)` (the *final* departure — fires after a consented leave or after the reconnection window expires). Do the "release tiles / delete player" cleanup in `onLeave`, not in a catch block on `allowReconnection`.
> - `new Server({ server: httpServer })` no longer exists. `ServerOptions` takes an `express: (app) => void` callback instead — Colyseus owns the HTTP server and hands you the Express app to add routes/middleware to. Call `gameServer.listen(port)` rather than manually creating an `http.Server`.
> - `@colyseus/schema` v5's `@type()` decorator needs `experimentalDecorators: true` (and `emitDecoratorMetadata: true`) in `tsconfig.json` — without it, TypeScript reports `TS1240: Unable to resolve signature of property decorator`.
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
import type { Broadcast } from '../systems/Broadcast';
import { TICK_RATE, TILE_SIZE, RECONNECT_WINDOW_SECONDS } from '../constants';
import type {
  InputMessage,
  ShootMessage,
  PlaceStructureMessage,
  InputAckEvent,
} from '../types/shared';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', /* ... */];

export class GameRoom extends Room<{ state: GameState }> {
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

  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client): void {
    this.state.tiles.forEach((tile) => {
      if (tile.ownerId === client.sessionId) tile.ownerId = '';
    });
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);

    if (this.hostId === client.sessionId) {
      const next = Array.from(this.state.players.values()).find((p) => p.connected);
      this.hostId = next ? next.id : null; // promote the next connected player
    }
  }

  private tick(dt: number): void {
    MovementSystem.update(this.state, this.playerInputs, dt);
    CollisionSystem.update(this.state, this.broadcastEvent);
    CombatSystem.update(this.state, dt, this.broadcastEvent);
    PhaseSystem.update(this.state, this.broadcastEvent);
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
import cors from 'cors';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom';

const PORT = Number(process.env.PORT) || 2567;

const gameServer = new Server({
  express: (app) => {
    app.use(cors());
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
  },
});

gameServer.define('GameRoom', GameRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Game server listening on :${PORT}`);
});
```

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
}
```

> Every field needs a default value (`= ''`, `= 0`, etc.) — `@colyseus/schema` v5 requires initialized properties, unlike some older versions. `Projectile.spawnedAt` was added during implementation (not in the original draft) so `CombatSystem` can expire projectiles by age without keeping any spawn-time bookkeeping in module-level state, which would leak across concurrent rooms since systems are shared singletons.

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

---

## Client — React Shell

### Screen State Machine

```
lobby ──► game ──► results ──► lobby
  │
  └──► (direct URL join) ──► lobby
```

### GameContext

```typescript
// contexts/GameContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';
import { Client, Room } from 'colyseus.js';
import { GameState } from '../types/shared';

type Screen = 'menu' | 'lobby' | 'game' | 'results';

interface GameContextValue {
  client: Client;
  room: Room<GameState> | null;
  setRoom: (room: Room<GameState> | null) => void;
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new Client('ws://localhost:2567'));
  const [room, setRoom] = useState<Room<GameState> | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');

  return (
    <GameContext.Provider value={{ client, room, setRoom, screen, setScreen }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
```

> **Not yet verified — do not start here without reading the compatibility warning under [Tech Stack](#tech-stack) first.** The sketch above is unchanged from the original draft and has not been checked against any real `colyseus.js` install. Given the `@colyseus/schema` v3-vs-v5 mismatch, both the `Client`/`Room` construction API *and* how `Room<T>` typing works may have shifted the same way the server's did (see the `Room<{ state: GameState }>` change) — confirm the installed client's actual API before writing this file for real.

### App Router

```typescript
// App.tsx
import { useGame } from './contexts/GameContext';
import { MenuScreen }    from './screens/MenuScreen';
import { LobbyScreen }   from './screens/LobbyScreen';
import { GameScreen }    from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';

export function App() {
  const { screen } = useGame();
  return (
    <>
      {screen === 'menu'    && <MenuScreen />}
      {screen === 'lobby'   && <LobbyScreen />}
      {screen === 'game'    && <GameScreen />}
      {screen === 'results' && <ResultsScreen />}
    </>
  );
}
```

### URL-based Room Joining
- Room created via HTTP `POST /rooms` → server returns `{ roomId, shortCode }`
- Shareable URL: `https://yourgame.com/play/ABC123`
- On page load, client reads room code from URL path and auto-joins that room
- Server validates: room exists, not full, game not already in `combat` or `results` phase

---

## Client — Phaser Game

### Phaser Config

```typescript
// game/PhaserGame.ts
import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene }    from './scenes/GameScene';
import { UIScene }      from './scenes/UIScene';

export function createPhaserGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a2e',
    scene: [PreloadScene, GameScene, UIScene],
    physics: { default: 'arcade' },  // used for client-side visual only, not authoritative
  });
}
```

### GameScene Responsibilities
- Render tile grid with ownership colors
- Interpolate player positions between server ticks (smooth at 60fps despite 20Hz server)
- Render projectile trails/effects
- Render structures with damage state visuals (intact → cracked → destroyed)
- Send player input to Colyseus room each frame
- Apply server state updates to local render state

### Interpolation Pattern
```typescript
// PlayerRenderer.ts — smooth other players between ticks
update(delta: number) {
  for (const [id, player] of this.players) {
    const target = this.serverState.players.get(id);
    if (!target) continue;
    // Lerp toward server position
    player.sprite.x = Phaser.Math.Linear(player.sprite.x, target.x, 0.2);
    player.sprite.y = Phaser.Math.Linear(player.sprite.y, target.y, 0.2);
  }
}
```

### Input Handler
```typescript
// input/InputHandler.ts
export class InputHandler {
  private seq = 0;
  private keys: Phaser.Types.Input.Keyboard.CursorKeys;

  update(room: Room) {
    const dir = { x: 0, y: 0 };
    if (this.keys.left.isDown)  dir.x = -1;
    if (this.keys.right.isDown) dir.x = 1;
    if (this.keys.up.isDown)    dir.y = -1;
    if (this.keys.down.isDown)  dir.y = 1;

    room.send('input', { dir, seq: ++this.seq });
  }
}
```

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
Server: onDrop(client) fires — mark player.connected = false
Server: this.allowReconnection(client, 180) — opens a 180s reconnection window
Other clients: show "Player X reconnecting..." over their frozen entity
       │
  ┌────▼────┐                    ┌────────────────┐
  │ < 3 min │                    │   >= 3 min     │
  └────┬────┘                    └───────┬────────┘
       │                                 │
Player reconnects                  Reconnect window expires
Client presents reconnectionToken  onLeave(client) fires
onReconnect(client) fires          Server: release player's tiles
player.connected = true            Server: delete player from state
```

> Implementation note: in Colyseus 0.18, `allowReconnection` is called from `onDrop()` (not from inside `onLeave()` as older docs suggested), and cleanup on expiry happens in `onLeave()`, which fires automatically once the reconnection window lapses. See the `GameRoom.ts` code above. The `playerDisconnected`/`playerReconnected` broadcast events from the original design are **not implemented** — clients currently learn about connection state only via the `Player.connected` field's delta sync.

### Reconnection Token
- Issued by Colyseus automatically on initial join
- Client stores in `sessionStorage` (persists across page refreshes in same tab, cleared on tab close)
- Presented automatically by `colyseus.js` client on reconnect

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

Because `MovementSystem`, `CollisionSystem`, `CombatSystem`, `StructureSystem`, and `PhaseSystem` are plain modules operating on a `GameState` instance (not `Room` subclasses), they can be exercised directly without spinning up a server or client — useful given the `colyseus.js` client version mismatch currently blocking real end-to-end testing (see [Tech Stack](#tech-stack)).

**Verified 2026-09-19** with a throwaway script run via `npx ts-node --transpile-only`, covering:
- Movement applies input and clamps to map bounds
- Tile claiming under a moving player, batched into one `tilesClaimed` broadcast, no re-broadcast for already-owned tiles
- Projectile-vs-player hit reduces health, broadcasts `playerHit`, and on a killing blow credits the shooter's `kills` and respawns the target at full health
- Projectile-vs-structure hit destroys the structure at 0 health and broadcasts `structureDestroyed`
- Projectiles expire by age (`spawnedAt` + `PROJECTILE_LIFETIME_MS`) even without a collision
- `PhaseSystem` advances phases once `endsAt` passes and broadcasts `phaseChanged`; `lobby` never auto-advances

This kind of test is worth keeping as the codebase grows — consider promoting it from a scratch script into a real test file (e.g. with `node:test` or `vitest`) once a test runner is added to the server's dependencies.

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
Bots are the most valuable local test tool once client compatibility is sorted — spin up 10 to stress-test tick performance, fuzz-test edge cases (concurrent tile claims, rapid connect/disconnect), and reproduce race conditions deterministically. **Blocked until the `colyseus.js` version question is resolved** (same as `GameContext`, above).

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
npm install colyseus @colyseus/schema express cors
npm install --save-dev typescript@~6.0.2 @types/node @types/express @types/cors ts-node-dev \
  eslint @eslint/js typescript-eslint globals \
  prettier eslint-config-prettier
```

> `typescript-eslint` currently requires TypeScript `<6.1.0` as a peer dependency — pin `typescript@~6.0.2` explicitly on both client and server if `npm install` resolves a newer TypeScript 7.x and the peer-dependency install fails.
>
> `npm install colyseus.js` on the client currently resolves to `0.16.22`, which is **not verified compatible** with the server's `colyseus@^0.18` / `@colyseus/schema@^5.0`. See the compatibility warning under [Tech Stack](#tech-stack) before relying on it.

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
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- `experimentalDecorators` + `emitDecoratorMetadata` — required for `@colyseus/schema`'s `@type(...)` decorators; without them, TypeScript reports `TS1240`.
- `module`/`moduleResolution: "NodeNext"` — the older `"module": "commonjs"` + `"moduleResolution": "node"` pairing now emits a `TS5107` deprecation error under TypeScript 6+.

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
| **Client networking library** | **Undecided — blocked** | `colyseus.js@0.16.22` (latest published) | The published client depends on `@colyseus/schema@^3.0.0`; the server uses `@colyseus/schema@^5.0.33`. This is a real wire-protocol compatibility risk, not just a type-checking annoyance, discovered while starting `GameContext` work. Must be resolved (verify a newer client, downgrade the server's schema major version, or find the currently-recommended pairing) before writing real client networking code — see the warning under Tech Stack |
