# tools/

Verification scripts for the game rules and server behavior. They are plain Node scripts (no test
framework) that print ✔/✘ per check and exit non-zero if anything fails. They exist because
`docs/ARCHITECTURE.md` cites verified numbers and behaviors; these are how to re-verify them after
a change. They are meant to be ported to Vitest when unit tests are added.

All of them run against the **compiled** server, so build it first:

```bash
cd server && npm run build
```

| Script | What it does | Needs a server? | Time |
|---|---|---|---|
| `check-rules.js` | Hex math, structure footprints and shape, movement, phases and the lobby, player names, characters, teams, combat, score, economy, shop, claim radius, and that the hand-copied `types/shared.ts` files match | No | ~1 s |
| `check-collisions.js` | Players vs. structures (792 approaches to the 7-hex hexagon), projectile speed and tunneling | No | ~2 s |
| `e2e.js` | Real `colyseus.js` clients against its own throwaway server (port 2598, phase times scaled down): the lobby (names, ready-up, countdown and its cancelling), match lifecycle with character kits, guns and the structure inventory, room closing, shop over the wire, mid-match joins, disconnect/reconnect notices, map edge | It starts its own | ~1 min |
| `bots.js` | Load bots for profiling a browser client; not a pass/fail check | Yes (yours) | as long as you run it |

```bash
node tools/check-rules.js
node tools/check-collisions.js
node tools/e2e.js
node tools/bots.js 4 120            # then profile the browser; see ARCHITECTURE.md, Performance pass
```

`e2e.js` needs `client/node_modules` installed (it borrows `colyseus.js`) and port 2598 free.

## What they don't cover

- **Anything visual** — rendering, the isometric projection, the shop menu, toasts, the results
  screen. Those were checked by hand in a browser; the techniques (including freezing the Phaser
  loop to screenshot a short-lived object, and timing frames) are in `docs/ARCHITECTURE.md` under
  Testing Multiplayer Locally.
- **A real backgrounded browser tab** (the tab-visibility reconnect was checked by simulating the
  visibility change).
- **Real network conditions** (latency, loss).
