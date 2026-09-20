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
| Server framework | Colyseus | Built-in rooms, delta sync, reconnection |
| Server language | TypeScript | Shared types with client |
| Client framework | React 18 | Component-based UI shell (menus, lobby) |
| Client language | TypeScript | Type safety, shared types with server |
| Game rendering | Phaser 3 | 2D canvas, tile grid, particles, animations |
| Bundler | Vite | Fast HMR, zero-config TS + React |
| Linting | ESLint + Prettier | Code quality and formatting |
| WebSocket protocol | Colyseus protocol (over ws) | Handles framing, delta compression |

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
│   │   ├── index.ts                # Entry point, HTTP + WS server setup
│   │   ├── rooms/
│   │   │   └── GameRoom.ts         # Colyseus room — core game logic
│   │   ├── state/
│   │   │   └── GameState.ts        # Colyseus schema definitions
│   │   ├── systems/
│   │   │   ├── TickSystem.ts       # Fixed-rate game loop (20Hz)
│   │   │   ├── MovementSystem.ts   # Input processing, position updates
│   │   │   ├── CollisionSystem.ts  # Hit detection, tile claiming
│   │   │   ├── CombatSystem.ts     # Shooting, projectile lifecycle
│   │   │   ├── StructureSystem.ts  # Structure placement, damage, destruction
│   │   │   └── PhaseSystem.ts      # Phase transitions, timer management
│   │   └── types/
│   │       └── shared.ts           # Shared types (imported by client too)
│   ├── tsconfig.json
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
│   │       └── shared.ts           # Symlink or copy of server/src/types/shared.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .eslintrc.json
│   ├── .prettierrc
│   └── package.json
│
└── shared/                         # (Optional) Shared types monorepo package
    └── types.ts                    # Single source of truth for message shapes
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

// Reconnect (sent automatically by Colyseus client)
{ type: "reconnect", reconnectionToken: string }
```

**Server → Client (via Colyseus state delta):**
```typescript
// Colyseus broadcasts state diffs automatically.
// Discrete events broadcast as messages:
{ type: "playerHit",    targetId: string, damage: number, shooterId: string }
{ type: "tilesClaimed", tiles: Array<{ x, y, ownerId }> }
{ type: "structureDestroyed", structureId: string }
{ type: "phaseChanged",  phase: GamePhase, endsAt: number }
{ type: "playerDisconnected", playerId: string, reconnectWindowMs: number }
{ type: "playerReconnected",  playerId: string }
{ type: "gameOver",      scores: Array<{ playerId, tilesOwned, kills }> }
```

### Sequence Numbers
Client tags each input with an incrementing `seq` number. Server echoes the last processed `seq` in state updates. Client uses this to reconcile which predicted moves have been confirmed and discard stale predictions.

---

## Server — Colyseus

### Room Setup (`GameRoom.ts`)

```typescript
import { Room, Client } from 'colyseus';
import { GameState } from '../state/GameState';

export class GameRoom extends Room<GameState> {
  maxClients = 10;
  TICK_RATE = 20; // Hz

  onCreate(options: RoomOptions) {
    this.setState(new GameState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / this.TICK_RATE);
    this.onMessage('input', (client, msg) => this.handleInput(client, msg));
    this.onMessage('shoot', (client, msg) => this.handleShoot(client, msg));
    this.onMessage('placeStructure', (client, msg) => this.handlePlace(client, msg));
  }

  onJoin(client: Client, options: JoinOptions) {
    // Spawn player, assign color, send full board state on first join
  }

  onLeave(client: Client, consented: boolean) {
    // Mark player disconnected, start 3-min reconnect timer
    this.allowReconnection(client, 180); // 180 seconds
  }

  onDispose() {
    // Room cleanup — called when last player leaves / timer expires
  }

  private tick(dt: number) {
    MovementSystem.update(this.state, dt);
    CollisionSystem.update(this.state);
    CombatSystem.update(this.state, dt);
    PhaseSystem.update(this.state, dt);
  }
}
```

### Server Entry Point (`index.ts`)

```typescript
import { Server } from 'colyseus';
import { createServer } from 'http';
import express from 'express';
import { GameRoom } from './rooms/GameRoom';

const app = express();
const httpServer = createServer(app);

const gameServer = new Server({ server: httpServer });
gameServer.define('GameRoom', GameRoom);

httpServer.listen(2567, () => {
  console.log('Game server listening on :2567');
});
```

---

## Game State Schema

Colyseus schemas automatically produce delta-compressed state diffs. Only changed fields are sent over the wire each tick.

```typescript
import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string')  id: string;
  @type('string')  name: string;
  @type('number')  x: number;
  @type('number')  y: number;
  @type('number')  health: number = 100;
  @type('number')  ammo: number = 30;
  @type('number')  tilesOwned: number = 0;
  @type('number')  kills: number = 0;
  @type('boolean') connected: boolean = true;
  @type('string')  color: string;           // hex color for tile ownership
}

export class Tile extends Schema {
  @type('string')  ownerId: string = '';    // empty string = unclaimed
}

export class Projectile extends Schema {
  @type('string')  id: string;
  @type('string')  ownerId: string;
  @type('number')  x: number;
  @type('number')  y: number;
  @type('number')  angle: number;
  @type('number')  speed: number = 400;    // pixels/sec
}

export class Structure extends Schema {
  @type('string')  id: string;
  @type('string')  ownerId: string;
  @type('number')  tileX: number;
  @type('number')  tileY: number;
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

---

## Game Mechanics

### Tile Claiming
- Players claim tiles by moving over unclaimed tiles or enemy tiles while in the claiming phase
- Tile ownership stored as `ownerId` string in the flat `tiles` array
- On claim: update tile, increment player's `tilesOwned`, broadcast delta
- Contested tiles (two players attempt same tile in same tick): server resolves by earliest input `seq`

### Game Phases

| Phase | Description | Duration |
|---|---|---|
| `lobby` | Players join, ready up | Until host starts |
| `claiming` | Players move, claim tiles | Configurable (e.g., 90s) |
| `combat` | PvP shooting enabled, structures can be placed/destroyed | Configurable (e.g., 120s) |
| `results` | Game over, scores displayed | 15s then room disposed |

- Server owns all timers. `endsAt` is a server epoch timestamp (ms); client uses this for display countdown and corrects any local drift.
- Phase transitions broadcast a `phaseChanged` message with the new phase and `endsAt`.

### Movement
- Continuous movement — clients send direction vector each tick
- Server applies velocity × deltaTime to player position
- Player positions validated server-side (bounds checking, collision with structures)
- Client-side prediction: client simulates own movement locally for responsiveness, corrects on server update

### PvP Shooting
- Client sends `shoot` message with angle
- Server spawns a `Projectile` in state with calculated trajectory
- Server advances all projectiles each tick via `CombatSystem`
- Hit detection runs server-side every tick (see Collision Detection)
- Projectiles have a max range/lifetime and are removed when expired or on hit
- Server broadcasts `playerHit` message; client plays hit effect

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

### Destruction Triggers
| Trigger | Action |
|---|---|
| `results` phase timer expires | Room disposed automatically |
| All players disconnect, reconnect windows all expire | Room disposed |
| Idle lobby (no activity for 10 min) | Room disposed by cleanup sweep |
| Host explicitly ends game | Phase set to `results`, then disposed |

### Cleanup Sweep
A periodic sweep every 60 seconds checks all rooms via `gameServer.presence` and disposes any that are empty or have been idle past their threshold.

---

## Reconnection System

### Flow

```
Player disconnects
       │
       ▼
Server: mark player.connected = false
Server: broadcast playerDisconnected { playerId, reconnectWindowMs: 180000 }
Server: store Colyseus reconnection reservation (180s)
Other clients: show "Player X reconnecting..." over their frozen entity
       │
  ┌────▼────┐                    ┌────────────────┐
  │ < 3 min │                    │   >= 3 min     │
  └────┬────┘                    └───────┬────────┘
       │                                 │
Player reconnects                  Reconnect window expires
Client presents reconnectionToken  Server: remove player entity
Server matches token → slot        Server: release player's tiles (per rules)
player.connected = true            Broadcast: playerLeft
Broadcast: playerReconnected
```

### Reconnection Token
- Issued by Colyseus automatically on initial join
- Client stores in `sessionStorage` (persists across page refreshes in same tab, cleared on tab close)
- Presented automatically by `colyseus.js` client on reconnect

### Disconnect Behavior During Game
- Player entity remains on the map (frozen — no movement, no shooting)
- Frozen players are still valid targets (shooting them continues)
- Their owned tiles are retained during the reconnect window
- Structures they placed remain active

---

## Collision Detection

**All collision detection runs server-side.** Client does no authoritative collision resolution.

### Projectile vs Player (Circle-Circle)
```typescript
// CollisionSystem.ts
function checkProjectilePlayerCollision(
  proj: Projectile,
  player: Player
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
  proj: Projectile,
  structure: Structure,
  tileSize: number
): boolean {
  const sx = structure.tileX * tileSize;
  const sy = structure.tileY * tileSize;
  return (
    proj.x > sx && proj.x < sx + tileSize &&
    proj.y > sy && proj.y < sy + tileSize
  );
}
```

### Tile Claiming (Grid)
Player position → floor to tile coordinates → check tile ownership:
```typescript
function claimTile(state: GameState, player: Player) {
  const tileX = Math.floor(player.x / TILE_SIZE);
  const tileY = Math.floor(player.y / TILE_SIZE);
  const idx = tileY * state.mapWidth + tileX;
  const tile = state.tiles[idx];
  if (tile && tile.ownerId !== player.id) {
    if (tile.ownerId !== '') {
      state.players.get(tile.ownerId)!.tilesOwned--;
    }
    tile.ownerId = player.id;
    player.tilesOwned++;
  }
}
```

### Spatial Optimization
At the expected entity count (≤10 players, ~30 projectiles, ~50 structures), a brute-force O(n²) check is acceptable. If entity counts grow significantly, introduce a simple grid spatial hash:
- Divide map into cells equal to the largest collision radius × 2
- Bucket entities by cell
- Check only entities in the same or adjacent cells per projectile

---

## Destructible Structures

### Health-Based Discrete Destruction (chosen approach)
Structures have a `health` field. Projectile hits reduce health by `damage`. At 0, structure is removed from state.

| Damage Threshold | Visual State |
|---|---|
| 100–67% health | Intact |
| 66–34% health | Cracked (visual overlay) |
| 33–1% health | Heavily damaged (different sprite/tint) |
| 0 health | Destroyed, removed from state |

### Server Logic
```typescript
// StructureSystem.ts
function applyDamage(structure: Structure, damage: number, state: GameState) {
  structure.health -= damage;
  if (structure.health <= 0) {
    state.structures.delete(structure.id);
    // Broadcast structureDestroyed event
  }
}
```

### Client Rendering
```typescript
// StructureRenderer.ts
function getStructureFrame(health: number, maxHealth: number): string {
  const pct = health / maxHealth;
  if (pct > 0.66) return 'structure-intact';
  if (pct > 0.33) return 'structure-cracked';
  return 'structure-damaged';
}
```

---

## Testing Multiplayer Locally

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
Bots are the most valuable local test tool — spin up 10 to stress-test tick performance, fuzz-test edge cases (concurrent tile claims, rapid connect/disconnect), and reproduce race conditions deterministically.

### Network Condition Simulation
- **Chrome DevTools** → Network tab → throttle individual tabs (100–300ms latency)
- **`clumsy`** (Windows) / **`tc qdisc`** (Linux) — OS-level latency, jitter, packet loss
- Test client-side prediction and reconciliation — bugs are invisible at 0ms latency

### Specific Scenarios to Test
| Scenario | What to verify |
|---|---|
| Two players claim same tile same tick | Server resolves by `seq` order, no tile stuck in invalid state |
| Player disconnects mid-combat | Entity freezes, 3-min timer starts, tile ownership retained |
| Player reconnects within 3 min | Control restored, state consistent with what server held |
| Player reconnects after 3 min | Player gone, tiles released, clean state |
| Phase timer expires | Phase transitions correctly on all connected clients |
| Room with 0 active players | Room disposed cleanly, no memory leak |
| Full room (10 players) | 11th join rejected with clear error |
| Server kill mid-match | Clients handle dropped WS connection, show reconnecting UI |

---

## Build Tooling

### Setup Commands

```bash
# Client
cd client
npm create vite@latest . -- --template react-ts
npm install phaser colyseus.js
npm install --save-dev eslint eslint-plugin-react eslint-plugin-react-hooks \
  @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  prettier eslint-config-prettier

# Server
cd server
npm init -y
npm install colyseus @colyseus/schema express
npm install --save-dev typescript @types/node ts-node-dev \
  eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  prettier eslint-config-prettier
```

### Client `package.json` Scripts
```json
{
  "scripts": {
    "dev":       "vite",
    "build":     "tsc && vite build",
    "preview":   "vite preview",
    "lint":      "eslint src --ext .ts,.tsx",
    "lint:fix":  "eslint src --ext .ts,.tsx --fix",
    "format":    "prettier --write src"
  }
}
```

### Server `package.json` Scripts
```json
{
  "scripts": {
    "dev":    "ts-node-dev --respawn src/index.ts",
    "build":  "tsc",
    "start":  "node dist/index.js",
    "lint":   "eslint src --ext .ts",
    "format": "prettier --write src"
  }
}
```

### `.eslintrc.json` (client)
```json
{
  "env": { "browser": true, "es2021": true },
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
  "plugins": ["react", "react-hooks", "@typescript-eslint"],
  "rules": {
    "react/react-in-jsx-scope": "off"
  },
  "settings": { "react": { "version": "detect" } }
}
```

### `.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## Decisions Log

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| Server framework | Colyseus | raw `ws`, uWebSockets.js | Built-in delta sync, reconnection, room management |
| Server runtime | Node.js | Deno, Bun | Most mature; best ecosystem for Colyseus |
| Server scaling | Single Node instance | Redis pub/sub, multi-instance | Sufficient at target player count (≤10/room) |
| Client rendering | Phaser 3 | Three.js, plain Canvas | 2D-optimized, tile grid support, particle effects |
| Client UI framework | React 18 | Lit.js, vanilla JS | Familiarity goal; good component model for lobby/menus |
| Client bundler | Vite | Webpack, Parcel | Fast HMR, zero-config TS+React, modern standard |
| Transport protocol | WebSockets (via Colyseus) | WebRTC, SSE, polling | Right latency profile; server-authoritative; P2P not needed at this scale |
| Collision detection | Home-rolled distance/AABB | Rapier, Planck.js, P2.js | Sufficient complexity; physics engine is overkill for this game type |
| Structure destruction | Health-based discrete | Voxel blocks, physics deformation | Simplest to implement, easiest to sync over network, easiest to balance |
| Reconnect window | 3 minutes | Immediate drop, longer window | Reasonable for casual play; short enough not to stall match indefinitely |
| Reconnect behavior | Freeze entity in place, retain tiles | Drop entity, release tiles | Fairer to reconnecting player; avoiding incentivizing disconnect |
| State serialization | Colyseus schema (binary delta) | JSON, MessagePack, Protobuf | Automatic, zero-config delta compression baked into framework |
| Tick rate | 20Hz | 10Hz, 30Hz, 60Hz | Good balance for tile/territory game; not a twitchy shooter |
| Language | TypeScript (client + server) | JavaScript | Type safety; shared type definitions between client and server |
