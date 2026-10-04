# tools/

Scripts that exercise the real server end to end, beyond what unit tests can reach. They are plain
Node scripts that print ✔/✘ per check and exit non-zero if anything fails.

**The game rules themselves are unit-tested with Vitest** (`cd server && npm test`; spec files sit
next to the code, e.g. `server/src/systems/ShopSystem.spec.ts`). Those specs replaced the old
`check-rules.js` and `check-collisions.js` scripts here on 2026-09-26, and back the numbers that
`docs/GAME_DESIGN.md` and `docs/ARCHITECTURE.md` cite.

These scripts run against the **compiled** server, so build it first:

```bash
cd server && npm run build
```

| Script | What it does | Needs a server? | Time |
|---|---|---|---|
| `e2e.js` | Real `colyseus.js` clients against its own throwaway server (port 2598, phase times scaled down): the lobby (names, ready-up, countdown and its cancelling), match lifecycle with character kits, the Fabricator gate (guns need a built Fabricator), guns and the structure inventory, room closing, shop over the wire, the guns game setting (off by default, on when asked, shown in the game list), mid-match joins, disconnect/reconnect notices, the game list, bots (add/change/remove, a full room, playing), defeat and private backpacks, Guard Towers, map edge | It starts its own | ~1.5 min |
| `bot-sim.js` | Headless bot-vs-bot matches (the in-game bots) on a virtual clock, printing each bot's score, hexes, kills, structures and kit, and the tick cost — for tuning `BOT_PROFILES`; not a pass/fail check | No | ~2 s per 5-minute match |
| `bots.js` | Load bots (wandering WebSocket clients, not the in-game bots) for profiling a browser client; not a pass/fail check | Yes (yours) | as long as you run it |
| `map-preview.js` | Renders generated maps to PNG, whole map top-down, one image per seed — for judging terrain generation; not a pass/fail check | No | ~1 s per map |

```bash
node tools/e2e.js
node tools/bot-sim.js easy,medium,hard 5 7   # difficulties, minutes, map seed [, mapSize, teams 0/1, guns 0/1]
node tools/bots.js 4 120            # then profile the browser; see ARCHITECTURE.md, Performance pass
node tools/map-preview.js           # seeds 1-6 into map-previews/ (git-ignored)
node tools/map-preview.js 7 42 --out /tmp/maps   # chosen seeds, chosen folder
```

`e2e.js` needs `client/node_modules` installed (it borrows `colyseus.js`) and port 2598 free, or
set `E2E_PORT` to use another. Separate ports also let several runs go at once, which is the
quickest way to shake out a timing-dependent check:

```bash
for p in 2601 2602 2603 2604; do E2E_PORT=$p node tools/e2e.js > e2e-$p.log 2>&1 & done; wait
grep -h "✘" e2e-*.log
```

**Terrain:** every room gets a random map, so a check that walks far (like the map-edge scenario)
could be stopped by a mountain. Such scenarios run on plain ground: `withServer(scale, fn,
{ TERRAIN_COVERAGE: '0' })` sets the server's `TERRAIN_COVERAGE` environment variable (dev/testing
only). Checks near a spawn don't need it, since the spawn areas are always clear.

**Writing checks that don't flake:** Colyseus sends broadcast messages immediately but state
changes on its next patch (every 50 ms), so a message can arrive before the state it describes.
Wait for the state itself (`waitFor(() => ...)`) rather than for a message plus a fixed `sleep`.
This is what made "the dropped player is marked disconnected" fail about once in ten runs until
2026-09-26.

## What they don't cover

- **Anything visual** — rendering, the isometric projection, the shop menu, toasts, the results
  screen. Those were checked by hand in a browser; the techniques (including freezing the Phaser
  loop to screenshot a short-lived object, and timing frames) are in `docs/ARCHITECTURE.md` under
  Testing Multiplayer Locally.
- **A real backgrounded browser tab** (the tab-visibility reconnect was checked by simulating the
  visibility change).
- **Real network conditions** (latency, loss).

## Map previews

`map-preview.js` colors: ground slate; mountains warm white (large mountains) and gray (small),
alternating shades so each mountain piece stands out; deep water dark blue, shallow water lighter;
the spawn hexes red. Fixed seeds always give the same picture, so render a few seeds, change the
generator (`server/src/terrain.ts`, tunables in `server/src/constants.ts`), rebuild, and render
the same seeds again to compare.

## Bot simulations

`bot-sim.js` builds a room the way `GameRoom` does (terrain, pods, the bots added in the lobby),
starts the match and runs the server's systems tick by tick, with `Date.now` replaced by a virtual
clock, so a 5-minute match takes about 2 seconds. The same seed gives the same map and the same
match: change a number in `BOT_PROFILES` (`server/src/constants.ts`), rebuild the server, and run
the same seeds again to compare. It prints the scores every minute, a table at the end, and how
long a tick took on average and at worst (the budget is 50 ms).
