# Sector 42

A real-time mobile web multiplayer territory-claiming game with PvP shooting and destructible structures. Inspired by hexar.io. Up to 8–10 players per match on an isometric hex map, with timed game phases.

Server-authoritative: clients send inputs, the server simulates everything and syncs state.

- **Server:** Node.js + TypeScript + [Colyseus](https://colyseus.io/) 0.16
- **Client:** React 19 + [Phaser](https://phaser.io/) 4 (Vite, TypeScript)

> **Status:** playable prototype. You can join a lobby, pick a team color and a character, ready up, then move around an isometric hex map, claim hexes, gather materials and pickups, fabricate items, shoot enemies (once you have a gun), place structures, and see the results. You can play alone against computer bots (Easy, Medium or Hard). Team pooling and a team win condition are designed but not built. See [Current Status & Known Issues](docs/ARCHITECTURE.md#current-status--known-issues).

## Quick start

You need **Node.js 22.13+** (20.19+ or 24+ also work). The project is developed on Node 24.

```bash
nvm use 24        # or whichever supported version you have installed
node -v
```

Install dependencies once (there is no root package — each folder is its own project):

```bash
cd server && npm ci
cd client && npm ci
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

Open http://localhost:5173 and click **Play**. On the game list, pick an open game or **Create game** (map size, game length, and switches for teams, drop pods and guns). In the lobby, set your name, pick a character (and a team, if the game has teams on), and press **Ready**. The match starts 3 seconds after everyone in the game is ready (on your own, that's straight away).

**Playing alone:** in the lobby, pick a difficulty under the player list and press **+ Add bot** once per opponent, then press **Ready**. Bots are always ready, so the match starts straight away.

Every game has a 4-character code (shown in the list and the lobby, with a **Copy link** button). `http://localhost:5173/game/CODE` goes straight to that game. The list comes from the server's `GET /games`.

To try multiplayer, open the game's link (or the list) in a second tab or window. Each tab is its own player, because the reconnection token lives in per-tab `sessionStorage`. The exception is Chrome's "Duplicate tab", which copies that storage, so the copy would rejoin as the same player; open a fresh tab instead.

## Scripts

Run these inside `server/` or `client/`.

### Server (`server/`)

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot restart (`ts-node-dev`, transpile-only — no type checking) |
| `npm run build` | Type-check and compile to `dist/` (`tsc`) |
| `npm start` | Run the compiled server (`node dist/server/src/index.js`) — run `build` first |
| `npm test` / `npm run test:watch` | Vitest unit tests (spec files sit next to the code: `ShopSystem.spec.ts`) |
| `npm run typecheck` | Type-check everything, specs included, without building |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config) |
| `npm run format` / `npm run format:check` | Prettier write / check |

### Client (`client/`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and produce a production bundle in `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm test` / `npm run test:watch` | Vitest unit and component tests (spec files sit next to the code: `foo.spec.ts`) |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config, React hooks rules) |
| `npm run format` / `npm run format:check` | Prettier write / check |

Before committing, run `npm run build && npm run lint` in whichever folder you changed, plus `npm test` in both `client/` and `server/`, and `node tools/e2e.js` after server changes (see [tools/README.md](tools/README.md)). `npm run dev` on the server skips type checking, so type errors only show up in `build`.

> **Code style:** 4-space indentation (Prettier `tabWidth: 4`). Some older files are still 2-space, so `format:check` flags them; run `npm run format` once in each folder to fix that, ideally in its own commit so it doesn't bury real changes.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Server port | `PORT` environment variable | `2567` |
| Phase length multiplier (dev/testing only) | `PHASE_TIME_SCALE` on the server, e.g. `PHASE_TIME_SCALE=0.05 npm run dev` runs a whole match in about 20 seconds | `1` |
| Server URL the client connects to | `VITE_SERVER_URL` (put it in `client/.env.local`) | `ws://localhost:2567` |

Health check: `GET http://localhost:2567/health` returns `{"status":"ok"}`.

Gameplay tunables (tick rate, speeds, damage, hex size, materials per claim, drop-pod odds per score tier, …) live in [`server/src/constants.ts`](server/src/constants.ts). Pickups are behind a feature flag there (`PICKUPS_ENABLED`); start the server with `PICKUPS=0` or `PICKUPS=1` to override it. **Guns are a per-game setting, off by default** (the **Guns** choice on Create game): with it off, players have no guns or ammo (not in the Build menu, not in drop pods, not bought by bots) and only Guard Towers shoot. The guns, ammo and shooting rules below describe a game with guns on. The client's render, smoothing and isometric settings are in [`client/src/game/constants.ts`](client/src/game/constants.ts); the hex/entity sizes there must match the server's.

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
| Move | `W` `A` `S` `D` or arrow keys — up, left, down, right on screen. **Right-click** the map to walk to that spot; any movement key cancels it | Virtual joystick (bottom left) |
| Shoot (needs a gun) | `Space` (hold to keep firing) or click, toward the mouse | **FIRE** button (bottom right, shown once you have a gun; hold to keep firing), or tap the map to fire at that spot |
| Place a structure you have | Click its icon in the **inventory bar** (right side, under Structures; the number is how many you have), or press **Place** next to it in the Build menu, or `E` or `P` for the one you picked last; while placing, `Tab` switches to your next structure type (`Shift+Tab` the previous). Then click where to put it — the outline is yellow where it fits, red where it doesn't. A **Guard Tower** (3 hexes) turns to the clump nearest the pointer, so aim at the corner where you want it. `Esc`, `E`, `P`, or its icon again cancels | Tap its icon, then tap where to put it (a refused tap flashes red; a Guard Tower turns toward the corner you tap); tap the icon again to cancel |
| Build menu (buy structures; make guns, ammo and upgrades) | **Build** button (below Leaderboard): `B` opens it on the **Structures** tab (never locked), `F` or `U` on the **Upgrades** tab (grayed out until you have built a Fabricator); `Esc` closes | **Build** button |
| Switch upgrade | Click its icon in the inventory bar (under Upgrades; the number is its level). The one in use is outlined; Armor is always on | Tap its icon |
| Leaderboard | **Leaderboard** button (top right) or `L`; `Esc` closes | **Leaderboard** button |
| Hide / show the inventory bar | `I` | — |
| Performance readout | `` ` `` (backtick) toggles fps, ms per frame, renderer and canvas size — useful when reporting slowness | — |
| **Dev only (temporary):** +500 materials | `M` during the match, in a dev build (`npm run dev`); a server started with `NODE_ENV=production` refuses it | — |

Your score is always shown at the top center. The mouse only aims and shoots. If you prefer "forward is toward the cursor" (with `A`/`D` strafing), set `MOVE_RELATIVE_TO_AIM = true` in [`client/src/game/constants.ts`](client/src/game/constants.ts) — but note it tends to feel like chasing the mouse, because the camera follows you.

## How a match works

0. **Pick a game** — **Play** on the start screen opens the game list: **Create game** at the top, a box to find a game by code or name, and the open games (lobbies first, then games in play, with player counts and settings). Joining one, or opening its link, takes you to its lobby. Creating one picks its settings: map size Small 64 × 64 (default), Big 80 × 80 or Large 96 × 96; game length 5 (default), 7 or 10 minutes; then three on/off switches (each with a [?] that explains it): teams off (default) or on; drop pods on (default) or off; guns off (default) or on.
1. **Lobby** — every player is listed. Click (or tap) your name to change it: 2–25 characters, anything goes. It's remembered for next time, and if someone already has it you get a "(1)" added. Next to your name are three choices:
   - **Team** (games with teams on) or **Color** (teams off: any color nobody else has) — a color. Players who pick the same color are teammates: you can't shoot each other or each other's structures, you can walk through each other's structures, and you don't take each other's hexes. Scores stay per player; the results screen also shows team totals. Everyone starts on their own color.
   - **Character** — your starting kit (default Farmer):

     | Character | Gun | Ammo | Materials | Structures | Upgrades |
     |---|---|---|---|---|---|
     | Farmer | — | 0 | 50 | Farm | — |
     | Engineer | — | 0 | 50 | Fabricator | — |
     | Robot | — | 0 | 50 | — | Booster 1, equipped (+33% top speed) |
     | Scientist | — | 0 | 50 | Power plant | — |
     | Explorer | — | 0 | 15 | — | Armor 1 (200 health) |

     Each structure type has a job (see below); the power plant's is still to come. Only the Engineer starts with a Fabricator.
   - **Ready** — press it when you're set (press again to cancel). Team and character are locked while you're ready.

   - **Bots** — under the player list, pick **Easy**, **Medium** or **Hard** and press **+ Add bot** for a computer-controlled player. Anyone in the lobby can change a bot's color (or team), character and difficulty, or remove it (✕). Bots count toward the 10 players and are always ready. They leave you alone near your own spawn. What each difficulty does is in [GAME_DESIGN → Bots](docs/GAME_DESIGN.md#bots-single-player).

   When everyone connected is ready, a **3-second countdown** starts. It's cancelled if anyone un-readies or someone new joins. Bots alone never start a match.
2. **Playing (5 minutes)** — everything happens at once: claim hexes by walking over them (you claim the hex you're on and any hex whose center is within your claim radius), shoot enemies (you need a gun — nobody starts with one: fabricate it or find it in a drop pod), build: buy structures in the **Build** menu and place them on hexes you own (**farms** raise your tile limit; a **Fabricator** opens the Fabricator menu; **Guard Towers** shoot), and gather materials. The Fabricator and Build menus open from their buttons — the game keeps running while they're open.
3. **Results (60s)** — the match ends and a results screen shows the winner and final standings. The room is locked and closes after a minute (or as soon as everyone has left), but the results stay on screen until you choose **Play again** (a fresh lobby) or **Main menu**.

**Upgrades tab** of the Build menu (during the match; `F` or `U`; grayed out until you have built a **Fabricator** structure, and locked again if your last one is destroyed). Guns, ammo and upgrades aren't bought, they're fabricated from materials:

| | Item | Cost | What it does |
|---|---|---|---|
| Weapons | Blaster | 200 | Lets you shoot, 25 damage per hit, 1 shot a second |
| | Ion Cannon | 400 | Twice the Blaster: 50 damage per hit, 2 shots a second, double the range; replaces the Blaster |
| | Ammo pack | 60 | 30 shots |
| Upgrades | Booster 1–3 | 100 a level | 133 / 166 / 199% speed |
| | Harvester 1–3 | 100 a level | Claim 7 / 19 / 37 hexes at once (shown as a tinted circle around you); 90 / 80 / 70% speed |
| | Armor 1–3 | 100 a level | 200 / 300 / 400 health; always on |
| | Jetpack | 200 | Walk over mountains and deep water, and 133% speed (like Booster 1) |


The Fabricator offers your next level of each upgrade. Levels last the whole match. You have **one upgrade slot**: of Booster, Harvester and Jetpack, only the equipped one works (Armor always does); the first one you fabricate equips itself, and you switch in the **Inventory**, instantly and as often as you like. Hexes with an enemy's structure on them can't be claimed.

**Structures** are bought for 100 materials on the **Structures** tab of the **Build** menu (the **Build** button or `B`; this tab never needs a Fabricator) and then placed on hexes you own (`E` or `P`, or click their icon in the inventory bar). Each has its own health, points and job:

| Structure | Hexes | Health | Points | What it does |
|---|---|---|---|---|
| Farm | 7 | 1000 | 100 (Farmer: 150) | Raises your **tile limit** by 500 |
| Fabricator | 7 | 1000 | 100 (Engineer: 150) | Opens the Fabricator (any more only add points) |
| Guard Tower | 3 touching | 500 | 50 | Shoots enemy players nearby with the Blaster, never runs out of ammo |
| Power plant | 7 | 1000 | 100 (Scientist: 150) | Essential — its job is still to come |

**Tile limit:** you can hold at most **500 hexes**, plus 500 for every farm you own. At the limit, walking over ground claims nothing (the HUD shows **Tiles: x / 500** and warns you), so build more farms. A 7-hex structure covers a hex and its 6 neighbors and a Guard Tower three hexes that touch; every one must be yours, on the map (not at the edge), and not under another structure. The structure is a slab inside its hexes; its top color shows its type (farm: pale green, fabricator: brown, Guard Tower: sandstone, power plant: pale blue) and its edge shows the owner's team. Enemies can't claim its hexes. Structures are solid: enemies can't walk through yours (they slide around it), but you and your teammates can.

**Score** (always shown at the top center): 1 point per hex you own and the points of each structure you own (table above); kills don't score. Materials aren't part of the score. Players have 100 health (200 with Armor); a Blaster hit does 25 and an Ion Cannon hit 50.

The first time anyone claims a hex, the claimer earns 1 material to fabricate with (re-taking a hex pays nothing). **Drop pods** are scattered on the map, all looking the same: walk onto one to open it and find out what's inside (materials, ammo, a gun, an upgrade or a structure). The further behind you are on score, the better your odds. About 2:50 into the match, empty spots get new pods over the following 15 seconds. **Connection drops:** if your connection drops, the game reconnects by itself (immediately when you switch back to the tab). Your player stays on the map, dimmed, and your spot and hexes are held for 3 minutes. Everyone else sees a notice when you disconnect and when you return. Players can't walk off the screen: the camera always follows you, even at the map's edge.

Players start on a line near the right-hand edge of the map, each on a round metal spawn platform (with respawning where you fell on, the default, your platform moves to where you fall): the first to join in the middle, later ones further toward the top and bottom. Defeated players are out for **5 seconds**, then respawn at their own starting spot with full health, keeping their tiles, structures, materials and kills. They keep their gun, ammo and upgrades too (the dropped-**backpack** feature is behind the `BACKPACKS=1` server flag and off by default). Within 6 hexes of your own spawn spot Guard Towers won't shoot you, and for 5 seconds after you respawn nothing can hurt you and bots ignore you (you blink while it lasts).

## Project layout

```
server/                     Colyseus game server
  src/index.ts              HTTP + WebSocket entry point
  src/constants.ts          Gameplay tunables
  src/hex.ts                Hex grid math (pixel <-> hex, bounds)
  src/rooms/GameRoom.ts     Room lifecycle, message handlers, tick loop
  src/state/GameState.ts    Synced state schema
  src/systems/              Movement, collision, combat, structures, phases, economy, score, bots
  src/bots/                 How bots decide: routes, aiming, what to fabricate
  src/types/shared.ts       Client/server message types
client/                     React + Phaser client
  src/context/GameContext   Connection lifecycle, reconnection, roster state
  src/net/                  colyseus.js wrapper and typed send helpers
  src/game/                 Phaser scene, iso/hex helpers, render constants
  src/components/           HUD, score badge, leaderboard popup, joystick, fire button (React overlays)
  src/screens/              Game screen hosting the canvas and overlays
docs/ARCHITECTURE.md        How it's built: architecture, protocol, technical decisions, status
docs/GAME_DESIGN.md         What the game is: rules, numbers, open design questions, design decisions
docs/HOSTING.md             AWS hosting plan
```

The server simulates in flat top-down coordinates. The isometric look is purely a client render transform; see [Map — hex grid and coordinate spaces](docs/ARCHITECTURE.md#map--hex-grid-and-coordinate-spaces) before touching positions or input, since mixing the two spaces is the easiest bug to introduce.

## Things to know before changing dependencies

- **Colyseus versions are pinned exactly** (no `^`) in `server/package.json`: `colyseus` 0.16.5, `@colyseus/core` 0.16.26, `@colyseus/schema` 3.0.76, `@colyseus/ws-transport` 0.16.5. The only published client, `colyseus.js` 0.16.x, works with that line and nothing newer. `@colyseus/core` is only a peer dependency, so an unpinned install silently jumps to 0.18 and breaks the build. After any dependency change run `rm -rf node_modules && npm ci && npm run build` in `server/`, then **join a game from a real browser** — several past bugs passed build and lint on each side and only appeared when a client and server ran together.
- `server/tsconfig.json` must keep `"useDefineForClassFields": false`. Without it the server crashes on the first client join (`Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')`).
- Code both sides need (messages, catalogs, hex math, shared sizes, the synced state's shape) lives once in `shared/`. Each side's `types/shared.ts`, `hex.ts` and constants files re-export it, so imports look the same as before. `shared/` can't import npm packages. `npm run lint` and `npm run format` in `server/` cover it.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `npm run build` fails with `SyntaxError: Unexpected token '?'` | Your shell is on an old Node. `nvm use 24` |
| Blank page, console says `useGameConnection must be used within a GameProvider` | `client/src/main.tsx` must wrap `<App />` in `<GameProvider>` |
| Page stays on "connecting…" | The server failed while sending state. Read the **server** log; check `useDefineForClassFields` (above) |
| `Failed to connect to the game server` | Server isn't running, or `VITE_SERVER_URL` points at the wrong host/port |
| `EADDRINUSE` on port 2567 | Another server instance is running. Stop it, or set a different `PORT` |
| The match doesn't start | Every connected player has to press **Ready**. A newcomer joining (not ready yet) cancels the countdown |
| Can't change team or character | You're ready — press **✓ Ready** again to un-ready, then change it |
| Shooting does nothing | Guns are off by default: create the game with **Guns: On**. With guns on, you need a gun: fabricate the Blaster in the **Fabricator** or find one in a drop pod (nobody starts armed), plus ammo |
| Results screen says "This room has closed." | Expected: finished rooms close after the results period. Choose **Play again** for a fresh lobby |
| Server restarts mid-game and everyone is dropped | Expected: `npm run dev` restarts on any file change and rooms live in memory |

## More documentation

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — what the game is: match flow, teams, characters, territory, combat, structures, economy, scoring and controls, open design questions, and a log of gameplay decisions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it's built: architecture, network protocol, state schema, how each game mechanic is implemented, testing notes, current status and known issues, planned features, and a log of technical decisions.
- [`docs/HOSTING.md`](docs/HOSTING.md) — how the game will be hosted on AWS under `kenecaswell.com`.
- [`CONTRIBUTION.md`](CONTRIBUTION.md) — how to report bugs, set up, and submit changes.
