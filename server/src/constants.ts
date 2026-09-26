// Central tunables shared across systems and GameRoom. Keeping these in one
// place avoids the same magic number (e.g. tile size) drifting out of sync
// between MovementSystem, CombatSystem, CollisionSystem, and GameRoom. Values the client must
// agree on (hex size, player/projectile radius, the on-screen y scale, base claim radius) live
// in shared/constants.ts and are re-exported here.

import { PLAYER_RADIUS } from '../../shared/constants';

export * from '../../shared/constants';

export const TICK_RATE = 20; // Hz
export const RECONNECT_WINDOW_SECONDS = 180; // 3 minutes

export const PLAYER_SPEED = 200; // pixels/sec, top on-screen speed (see SCREEN_Y_SCALE)
// The 'boost' upgrade (the Robot starts with it) multiplies top speed by this. Acceleration is
// unchanged, so a boosted player takes a little longer to reach their higher top speed.
export const BOOST_SPEED_MULTIPLIER = 1.25;
// If a client sends nothing for this long (tab backgrounded, connection stalled), its last
// input is discarded and the player coasts to a stop instead of running on forever. The client
// re-sends its input at least every 250ms while active, so this leaves generous margin.
export const INPUT_STALE_MS = 750;
export const PLAYER_ACCEL = 1200; // pixels/sec^2 — speeding up, slowing down, and turning all use this, so movement eases instead of snapping
// Players are kept this far inside the map rectangle, so their whole body stays on the terrain
// (rather than half hanging over the edge).
export const MAP_EDGE_MARGIN = 20;

// Damage per hit comes from the shooter's gun (GUN_DAMAGE in types/shared.ts: basic 50, big 100).
export const BASE_MAX_HEALTH = 100; // two basic-gun hits kill
export const ARMOR_MAX_HEALTH = 200; // with the Armor upgrade: +100%
export const PROJECTILE_LIFETIME_MS = 2000;

// Phase lengths. PHASE_TIME_SCALE (an environment variable, dev/testing only) shrinks them all so
// a whole match can be run in seconds, e.g. PHASE_TIME_SCALE=0.02 npm run dev. Leave it unset normally.
const requestedScale = Number(process.env.PHASE_TIME_SCALE);
const PHASE_TIME_SCALE = requestedScale > 0 ? requestedScale : 1;
// Once everyone in the lobby is ready (see LobbySystem).
export const COUNTDOWN_DURATION_MS = 3_000 * PHASE_TIME_SCALE;
export const MATCH_DURATION_MS = 5 * 60_000 * PHASE_TIME_SCALE; // the `playing` phase
// After the match ends the room is locked (no new players) and kept open this long so players can
// look at the results, then closed. It closes sooner if everyone leaves.
export const RESULTS_DURATION_MS = 60_000 * PHASE_TIME_SCALE;

// Claiming uses the player's `claimRadius`: BASE_CLAIM_RADIUS (shared/constants.ts) normally, this
// with the Expander upgrade (see CharacterSystem.applyUpgradeEffects). The client draws a tinted
// circle of the player's current `claimRadius` once it's above the base. The Expander's claim radius scales with the player's size: 4x the player radius (80px at 20;
// it was 64px, twice the base radius, when the player radius was 16).
export const EXPANDER_CLAIM_RADIUS = PLAYER_RADIUS * 4;

// Score = tiles owned x TILE_POINTS + kills x KILL_POINTS + structures owned x STRUCTURE_POINTS.
// Credits are NOT part of the score (they're for buying things). STRUCTURE_POINTS is a
// placeholder for the one generic structure; planned types (city hall/school/house/fort)
// will each get their own value.
export const TILE_POINTS = 1;
export const KILL_POINTS = 50;
export const STRUCTURE_POINTS = 25;

export const CREDIT_PAYOUT_INTERVAL_MS = 10_000; // 1 credit per owned tile, every 10s

// Terrain generation (see terrain.ts and docs/GAME_DESIGN.md → Terrain). A new layout is made for
// every match. Features keep at least one ground hex between them, so these sizes are exact.
// Share of the map that ends up mountain or water (~410 hexes). The TERRAIN_COVERAGE environment
// variable (dev/testing only, like PHASE_TIME_SCALE) overrides it, e.g. 0 for a map of plain ground.
const requestedCoverage = Number(process.env.TERRAIN_COVERAGE);
export const TERRAIN_COVERAGE =
    process.env.TERRAIN_COVERAGE !== undefined && requestedCoverage >= 0 ? requestedCoverage : 0.1;
// How often each kind of feature is picked while filling up to TERRAIN_COVERAGE.
export const TERRAIN_FEATURE_WEIGHTS = { mountain: 0.4, lake: 0.35, river: 0.25 };
// A range or lake that gets boxed in before reaching `min` is dropped. (With lakes of 3+ and rivers
// of 2+, no water hex is ever alone, so the "lone water is wadeable" rule never comes up.)
// Mountain ranges are built from mountain pieces (each will get its own sprite): a small mountain is
// 3 hexes that all touch, a large one is 7 (a hex and its 6 neighbors, like a structure). Pieces
// touch but never overlap, so a range is 3 hexes (one small mountain) up to MOUNTAIN_SIZE.max.
export const MOUNTAIN_SIZE = { min: 3, max: 35 }; // hexes, contiguous
export const MOUNTAIN_LARGE_CHANCE = 0.4; // chance each piece is a large mountain (when it fits)
export const LAKE_SIZE = { min: 3, max: 32 }; // hexes, contiguous
export const RIVER_LENGTH = { min: 2, max: 20 }; // hexes along its course
export const RIVER_WIDTH = { min: 1, max: 4 }; // hexes across; varies along the river
export const RIVER_TURN_CHANCE = 0.3; // per step, the river bends 60° left or right
export const RIVER_WIDTH_CHANGE_CHANCE = 0.25; // per step, the width goes up or down by 1
// A ground hex with at least this many neighbors in one river is filled in (no holes at bends).
export const RIVER_POCKET_FILL = 4;
// At least this many ground hexes separate any two features (mountain ranges, lakes, rivers).
export const FEATURE_GAP = 3;
// Hexes within this many steps of the spawn hex (the map center) are always ground.
export const SPAWN_CLEAR_RADIUS = 4;
