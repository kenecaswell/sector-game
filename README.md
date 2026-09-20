# Sector 42

A real-time mobile web multiplayer territory-claiming game with PvP shooting and destructible structures. Inspired by hexar.io. Up to 8–10 players per match on an isometric hex map, with timed game phases.

Server-authoritative: clients send inputs, the server simulates everything and syncs state.

- **Server:** Node.js + TypeScript + [Colyseus](https://colyseus.io/) 0.16
- **Client:** React 19 + [Phaser](https://phaser.io/) 4 (Vite, TypeScript)

> **Status:** playable prototype. You can join a lobby, start a match, move with mouse-aim controls, claim hexes, earn credits, and shoot. Teams, scoring/win condition, and the results screen are designed but not built. See [Current Status & Known Issues](docs/technical-blueprint.md#current-status--known-issues).

## Quick start

You need **Node.js 22.13+** (20.19+ or 24+ also work). The project is developed on Node 24. Older versions fail in confusing ways — for example, a default Node 13 shell can't even run `tsc` (`SyntaxError: Unexpected token '?'`).

```bash
nvm use 24        # or whichever supported version you have installed
node -v
```

Install dependencies once (there is no root package — each folder is its own project):

```bash
cd server && npm ci
cd ../client && npm ci
```

Run the server and the client in **two terminals**:

```bash
# Terminal 1 — game server on http://localhost:2567
cd server
npm run dev
```

```bash
# Terminal 2 — client on http://localhost:5173
cd client
npm run dev
```

Open http://localhost:5173, click **Join Game**, then **Start Game** (only the first player in a room — the host — can start it).

To try multiplayer, open the page in a second tab or window. Each tab is its own player, because the reconnection token lives in per-tab `sessionStorage`. The exception is Chrome's "Duplicate tab", which copies that storage, so the copy would rejoin as the same player; open a fresh tab instead.

## Scripts

Run these inside `server/` or `client/`.

### Server (`server/`)

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot restart (`ts-node-dev`, transpile-only — no type checking) |
| `npm run build` | Type-check and compile to `dist/` (`tsc`) |
| `npm start` | Run the compiled server (`node dist/index.js`) — run `build` first |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config) |
| `npm run format` / `npm run format:check` | Prettier write / check |

### Client (`client/`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and produce a production bundle in `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config, React hooks rules) |
| `npm run format` / `npm run format:check` | Prettier write / check |

There is no automated test suite yet. Before committing, run `npm run build && npm run lint` in whichever folder you changed — `npm run dev` on the server skips type checking, so type errors only show up in `build`.

> **Code style:** 4-space indentation (Prettier `tabWidth: 4`). Some older files are still 2-space, so `format:check` flags them; run `npm run format` once in each folder to fix that, ideally in its own commit so it doesn't bury real changes.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Server port | `PORT` environment variable | `2567` |
| Server URL the client connects to | `VITE_SERVER_URL` (put it in `client/.env.local`) | `ws://localhost:2567` |

Health check: `GET http://localhost:2567/health` returns `{"status":"ok"}`.

Gameplay tunables (tick rate, speeds, damage, hex size, credit payout, …) live in [`server/src/constants.ts`](server/src/constants.ts). The client's render, smoothing and isometric settings are in [`client/src/game/constants.ts`](client/src/game/constants.ts); the hex/entity sizes there must match the server's.

### Testing on a phone or another machine

The server listens on all interfaces and allows any origin. Start both sides so they're reachable over your network, pointing the client at your machine's LAN address:

```bash
# server/ — already reachable on your LAN
npm run dev

# client/ — expose Vite and tell it where the server is
VITE_SERVER_URL=ws://<your-lan-ip>:2567 npx vite --host
```

Then open `http://<your-lan-ip>:5173` on the phone.

## Controls

| | Desktop | Touch |
|---|---|---|
| Aim | Mouse | Follows your movement direction |
| Move | `W` `A` `S` `D` or arrow keys — up, left, down, right on screen | Virtual joystick (bottom left) |
| Shoot | Click (combat phase) | Tap the map |
| Build a structure | **Build** button, then click a hex you own (combat phase) | **Build** button, then tap a hex you own |

The mouse only aims and shoots. If you prefer "forward is toward the cursor" (with `A`/`D` strafing), set `MOVE_RELATIVE_TO_AIM = true` in [`client/src/game/constants.ts`](client/src/game/constants.ts) — but note it tends to feel like chasing the mouse, because the camera follows you.

## How a match works

1. **Lobby** — players join; the host starts the match.
2. **Claiming (90s)** — move over hexes to claim them.
3. **Combat (120s)** — shooting is enabled, and you can build structures on hexes you own and destroy other players' structures.
4. **Results (15s)** — the match ends. Scoring and a winner are not implemented yet.

Every 10 seconds each player earns 1 credit per hex they own. Defeated players respawn at the map center with full health, keeping their tiles and kills.

## Project layout

```
server/                     Colyseus game server
  src/index.ts              HTTP + WebSocket entry point
  src/constants.ts          Gameplay tunables
  src/hex.ts                Hex grid math (pixel <-> hex, bounds)
  src/rooms/GameRoom.ts     Room lifecycle, message handlers, tick loop
  src/state/GameState.ts    Synced state schema
  src/systems/              Movement, collision, combat, structures, phases, economy
  src/types/shared.ts       Client/server message types
client/                     React + Phaser client
  src/context/GameContext   Connection lifecycle, reconnection, roster state
  src/net/                  colyseus.js wrapper and typed send helpers
  src/game/                 Phaser scene, iso/hex helpers, render constants
  src/components/           HUD, leaderboard, mobile joystick (React overlays)
  src/screens/              Game screen hosting the canvas and overlays
docs/technical-blueprint.md Architecture, protocol, decisions, status
```

The server simulates in flat top-down coordinates. The isometric look is purely a client render transform; see [Map — hex grid and coordinate spaces](docs/technical-blueprint.md#map--hex-grid-and-coordinate-spaces) before touching positions or input, since mixing the two spaces is the easiest bug to introduce.

## Things to know before changing dependencies

- **Colyseus versions are pinned exactly** (no `^`) in `server/package.json`: `colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5. The only published client, `colyseus.js` 0.16.x, works with that line and nothing newer. `@colyseus/core` is only a peer dependency, so an unpinned install silently jumps to 0.18 and breaks the build. After any dependency change run `rm -rf node_modules && npm ci && npm run build` in `server/`, then **join a game from a real browser** — several past bugs passed build and lint on each side and only appeared when a client and server ran together.
- `server/tsconfig.json` must keep `"useDefineForClassFields": false`. Without it the server crashes on the first client join (`Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')`).
- `client/src/types/shared.ts` and `client/src/game/hex.ts` are hand-copies of the matching server files. Change both sides together.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `npm run build` fails with `SyntaxError: Unexpected token '?'` | Your shell is on an old Node. `nvm use 24` |
| Blank page, console says `useGameConnection must be used within a GameProvider` | `client/src/main.tsx` must wrap `<App />` in `<GameProvider>` |
| Page stays on "connecting…" | The server failed while sending state. Read the **server** log; check `useDefineForClassFields` (above) |
| `Failed to connect to the game server` | Server isn't running, or `VITE_SERVER_URL` points at the wrong host/port |
| `EADDRINUSE` on port 2567 | Another server instance is running. Stop it, or set a different `PORT` |
| Start Game does nothing | Only the host can start. The host is the first connected player; if they disconnect, the next connected player is promoted immediately |
| Server restarts mid-game and everyone is dropped | Expected: `npm run dev` restarts on any file change and rooms live in memory |

## More documentation

- [`docs/technical-blueprint.md`](docs/technical-blueprint.md) — architecture, network protocol, state schema, game mechanics, testing notes, current status and known issues, planned features, and a decisions log explaining *why* things are the way they are.
