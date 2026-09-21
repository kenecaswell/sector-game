// Central tunables shared across systems and GameRoom. Keeping these in one
// place avoids the same magic number (e.g. tile size) drifting out of sync
// between MovementSystem, CombatSystem, CollisionSystem, and GameRoom.

export const TICK_RATE = 20; // Hz
export const HEX_SIZE = 32; // hex circumradius in pixels (flat-top; see hex.ts)
export const RECONNECT_WINDOW_SECONDS = 180; // 3 minutes

// The client draws the world with y squashed by this factor (its ISO_SQUASH — keep them equal).
// Player speed and acceleration are measured on-screen, i.e. 1 world px of y counts as this much
// as 1 world px of x, so moving straight up the screen is as fast as moving sideways. Set to 1
// for speed that is uniform in world space instead (vertical then looks ~40% slower on screen).
export const SCREEN_Y_SCALE = 0.6;

export const PLAYER_SPEED = 200; // pixels/sec, top on-screen speed (see SCREEN_Y_SCALE)
// If a client sends nothing for this long (tab backgrounded, connection stalled), its last
// input is discarded and the player coasts to a stop instead of running on forever. The client
// re-sends its input at least every 250ms while active, so this leaves generous margin.
export const INPUT_STALE_MS = 750;
export const PLAYER_ACCEL = 1200; // pixels/sec^2 — speeding up, slowing down, and turning all use this, so movement eases instead of snapping
export const PLAYER_RADIUS = 16; // pixels, for projectile collision

export const PROJECTILE_RADIUS = 6; // pixels, for player collision
export const PROJECTILE_DAMAGE = 50; // players start at 100 health, so two hits kill (armor and better guns come later)
export const PROJECTILE_LIFETIME_MS = 2000;

// Phase lengths. PHASE_TIME_SCALE (an environment variable, dev/testing only) shrinks them all so
// a whole match can be run in seconds, e.g. PHASE_TIME_SCALE=0.02 npm run dev. Leave it unset normally.
const requestedScale = Number(process.env.PHASE_TIME_SCALE);
const PHASE_TIME_SCALE = requestedScale > 0 ? requestedScale : 1;
export const BUY_PHASE_DURATION_MS = 30_000 * PHASE_TIME_SCALE; // quick shopping before play starts
export const MATCH_DURATION_MS = 5 * 60_000 * PHASE_TIME_SCALE; // the `playing` phase
// After the match ends the room is locked (no new players) and kept open this long so players can
// look at the results, then closed. It closes sooner if everyone leaves.
export const RESULTS_DURATION_MS = 60_000 * PHASE_TIME_SCALE;

export const STARTING_CREDITS = 100; // credits each player begins with (to spend in the buy menu)

// Score = tiles owned x TILE_POINTS + kills x KILL_POINTS + structures owned x STRUCTURE_POINTS.
// Credits are NOT part of the score (they're for buying things). STRUCTURE_POINTS is a
// placeholder for the one generic structure; planned types (city hall/school/house/fort)
// will each get their own value.
export const TILE_POINTS = 1;
export const KILL_POINTS = 50;
export const STRUCTURE_POINTS = 25;

export const CREDIT_PAYOUT_INTERVAL_MS = 10_000; // 1 credit per owned tile, every 10s
