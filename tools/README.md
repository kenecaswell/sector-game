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
| `e2e.js` | Real `colyseus.js` clients against its own throwaway server (port 2598, phase times scaled down): the lobby (names, ready-up, countdown and its cancelling), match lifecycle with character kits, guns and the structure inventory, room closing, shop over the wire, mid-match joins, disconnect/reconnect notices, map edge | It starts its own | ~1 min |
| `bots.js` | Load bots for profiling a browser client; not a pass/fail check | Yes (yours) | as long as you run it |
| `map-preview.js` | Renders generated maps to PNG, whole map top-down, one image per seed — for judging terrain generation; not a pass/fail check | No | ~1 s per map |

```bash
node tools/e2e.js
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
the spawn hex red. Fixed seeds always give the same picture, so render a few seeds, change the
generator (`server/src/terrain.ts`, tunables in `server/src/constants.ts`), rebuild, and render
the same seeds again to compare.
