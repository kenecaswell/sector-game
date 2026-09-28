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
// If a client sends nothing for this long (tab backgrounded, connection stalled), its last
// input is discarded and the player coasts to a stop instead of running on forever. The client
// re-sends its input at least every 250ms while active, so this leaves generous margin.
export const INPUT_STALE_MS = 750;
export const PLAYER_ACCEL = 1200; // pixels/sec^2 — speeding up, slowing down, and turning all use this, so movement eases instead of snapping
// Players are kept this far inside the map rectangle, so their whole body stays on the terrain
// (rather than half hanging over the edge).
export const MAP_EDGE_MARGIN = 20;

// Damage per hit comes from the shooter's gun (GUN_DAMAGE in types/shared.ts: basic 50, big 100).
export const BASE_MAX_HEALTH = 100; // two basic-gun hits kill; Armor adds ARMOR_HEALTH_PER_LEVEL a level
export const PROJECTILE_LIFETIME_MS = 2000;

// Phase lengths. PHASE_TIME_SCALE (an environment variable, dev/testing only) shrinks them all so
// a whole match can be run in seconds, e.g. PHASE_TIME_SCALE=0.02 npm run dev. Leave it unset normally.
const requestedScale = Number(process.env.PHASE_TIME_SCALE);
export const PHASE_TIME_SCALE = requestedScale > 0 ? requestedScale : 1;
// Once everyone in the lobby is ready (see LobbySystem).
export const COUNTDOWN_DURATION_MS = 3_000 * PHASE_TIME_SCALE;
export const MATCH_DURATION_MS = 5 * 60_000 * PHASE_TIME_SCALE; // the `playing` phase
// After the match ends the room is locked (no new players) and kept open this long so players can
// look at the results, then closed. It closes sooner if everyone leaves.
export const RESULTS_DURATION_MS = 60_000 * PHASE_TIME_SCALE;

// Claiming uses the player's `claimRadius`: BASE_CLAIM_RADIUS (shared/constants.ts) normally, or one
// of these with the Expander equipped, by level (see UpgradeSystem.applyUpgradeEffects). They're
// picked so a player standing mid-hex claims EXPANDER_HEXES (7 / 19 / 37: 1, 2 and 3 rings of
// neighbors), whose centers sit up to 55 / 111 / 166 world px away. Level 1 is 4 x the player radius
// (80 px), the Expander's radius before it had levels. The client draws a tinted circle of the
// player's `claimRadius` whenever it's above the base.
export const EXPANDER_CLAIM_RADII = [PLAYER_RADIUS * 4, 125, 180];

// Score = tiles owned x TILE_POINTS + kills x KILL_POINTS + structures owned x STRUCTURE_POINTS.
// Materials are NOT part of the score (they're for buying things). STRUCTURE_POINTS is a
// placeholder for the one generic structure; planned types (city hall/school/house/fort)
// will each get their own value.
export const TILE_POINTS = 1;
export const KILL_POINTS = 50;
export const STRUCTURE_POINTS = 25;

// Materials from claiming: this many for a hex nobody has claimed before this match. Re-taking a hex
// (from an enemy, or one released when its owner left) pays nothing. Pickups are the other source.
export const MATERIALS_PER_CLAIM = 1;

// DEV ONLY (temporary): the M key sends 'devMaterials', which adds DEV_MATERIALS during the match.
// Refused when NODE_ENV is 'production'. Remove before hosting (see docs/HOSTING.md).
export const DEV_MATERIALS = 500;
export const DEV_CHEATS_ENABLED = process.env.NODE_ENV !== 'production';

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
// Hexes within this many steps of any spawn hex are always ground.
export const SPAWN_CLEAR_RADIUS = 3;

// Spawn line (see terrain.ts → spawnHex): one spawn hex per slot, in a column this many hexes in from
// the right-hand (east) edge. Slot 0 is the middle row; later slots alternate above and below it,
// SPAWN_ROW_SPACING rows apart. SPAWN_SLOTS matches GameRoom.maxClients.
export const SPAWN_SLOTS = 10;
export const SPAWN_EDGE_INSET = 3;
export const SPAWN_ROW_SPACING = 6;

// Pickups: items scattered on the map when the room is created (see pickups.ts, PickupSystem.ts).
// FEATURE FLAG: PICKUPS_ENABLED turns them on or off. The PICKUPS environment variable overrides it
// (PICKUPS=0 off, PICKUPS=1 on), like TERRAIN_COVERAGE.
const PICKUPS_DEFAULT = true;
export const PICKUPS_ENABLED =
    process.env.PICKUPS === undefined
        ? PICKUPS_DEFAULT
        : !['0', 'false', 'off'].includes(process.env.PICKUPS);
// One location per cell of a PICKUP_GRID.cols x PICKUP_GRID.rows grid over the map (12), each at
// its cell's center nudged up to PICKUP_JITTER hexes, then moved to the nearest hex that's ground
// and outside every spawn area.
export const PICKUP_GRID = { cols: 4, rows: 3 };
// Chance (%) that a location gets no pod at all, at the start and at each respawn wave.
export const PICKUP_EMPTY_CHANCE = 5;
// Respawn waves: every PICKUP_RESPAWN_MS into the match (2:50; one wave in a 5-minute match), each
// grid cell with no pod left gets a new one (placed the same way, same empty chance), appearing after
// its own random 0 - PICKUP_RESPAWN_DELAY_MAX_MS delay. Both scale with PHASE_TIME_SCALE.
export const PICKUP_RESPAWN_MS = 170_000 * PHASE_TIME_SCALE;
export const PICKUP_RESPAWN_DELAY_MAX_MS = 15_000 * PHASE_TIME_SCALE;
export const PICKUP_JITTER = 2;
// Every location holds an identical drop pod; what's inside is rolled when a player collects it,
// from the table for that player's score tier (see pickups.ts → scoreTier): tier 1 is the leader,
// tier 4 is at the back. Leaders mostly get materials and ammo; players further behind get better
// odds of guns, upgrades and structures. Each row's weights are percentages and add up to 100.
// An item the collector can't use (a gun no better than theirs, an upgrade they all have) is left
// out and the rest of that row shares its chance.
export type PickupOutcome = 'materials' | 'ammo' | 'upgrade' | 'basicGun' | 'bigGun' | 'structure';
export const PICKUP_TIER_CHANCES: Record<PickupOutcome, number>[] = [
    // tier 1: the leader(s)
    { materials: 50, ammo: 35, upgrade: 5, basicGun: 5, bigGun: 3, structure: 2 },
    // tier 2
    { materials: 42, ammo: 30, upgrade: 10, basicGun: 8, bigGun: 5, structure: 5 },
    // tier 3
    { materials: 32, ammo: 25, upgrade: 15, basicGun: 10, bigGun: 8, structure: 10 },
    // tier 4: at the back
    { materials: 22, ammo: 20, upgrade: 20, basicGun: 10, bigGun: 10, structure: 18 },
];
export const PICKUP_MATERIALS = { min: 10, max: 50 };
export const PICKUP_AMMO = { min: 10, max: 30 };
