// Central tunables shared across systems and GameRoom. Keeping these in one
// place avoids the same magic number (e.g. tile size) drifting out of sync
// between MovementSystem, CombatSystem, CollisionSystem, and GameRoom. Values the client must
// agree on (hex size, player/projectile radius, the on-screen y scale, base claim radius) live
// in shared/constants.ts and are re-exported here.

import { PLAYER_RADIUS } from '../../shared/constants';
import {
    GUN_FIRE_INTERVAL_MS,
    GUN_SHOT_LIFETIME_MS,
    MAX_PLAYERS,
    type BotDifficulty,
    type ShopItemId,
} from '../../shared/types';

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
// A defeated player is out of the match this long, then respawns at their spawn spot (RespawnSystem).
export const RESPAWN_DELAY_MS = 5_000;
export const BASE_MAX_HEALTH = 100; // two blaster hits kill; Armor adds ARMOR_HEALTH_PER_LEVEL a level
export const PROJECTILE_SPEED = 600; // on-screen px/sec (was 400 until 2026-09-27); see projectileVelocity
export const PROJECTILE_LIFETIME_MS = GUN_SHOT_LIFETIME_MS.basic; // the Blaster's (and the tower's) shot: with PROJECTILE_SPEED, a range of 1,200 on-screen px; the Ion Cannon's is double
// Mountains stop shots: each tick's travel is checked for mountain every this many world px, so a
// fast shot can't skip over the thin tip of a mountain hex between ticks.
export const SHOT_TERRAIN_STEP = 10;

// Phase lengths. PHASE_TIME_SCALE (an environment variable, dev/testing only) shrinks them all so
// a whole match can be run in seconds, e.g. PHASE_TIME_SCALE=0.02 npm run dev. Leave it unset normally.
const requestedScale = Number(process.env.PHASE_TIME_SCALE);
export const PHASE_TIME_SCALE = requestedScale > 0 ? requestedScale : 1;
// After respawning a player has this long (ms) when nothing can hurt them and bots and Guard Towers
// ignore them (the client shows it as the player pulsing between 50% and 100% opacity).
export const RESPAWN_GRACE_MS = 5_000 * PHASE_TIME_SCALE;
// Once everyone in the lobby is ready (see LobbySystem).
export const COUNTDOWN_DURATION_MS = 3_000 * PHASE_TIME_SCALE;
// The `playing` phase lasts the game's own match length (settings.matchMinutes; PhaseSystem).
// After the match ends the room is locked (no new players) and kept open this long so players can
// look at the results, then closed. It closes sooner if everyone leaves.
export const RESULTS_DURATION_MS = 60_000 * PHASE_TIME_SCALE;

// Claiming uses the player's `claimRadius`: BASE_CLAIM_RADIUS (shared/constants.ts) normally, or one
// of these with the Harvester equipped, by level (see UpgradeSystem.applyUpgradeEffects). They're
// picked so a player standing mid-hex claims EXPANDER_HEXES (7 / 19 / 37: 1, 2 and 3 rings of
// neighbors), whose centers sit up to 55 / 111 / 166 world px away. Level 1 is 4 x the player radius
// (80 px), the Harvester's radius before it had levels. The client draws a tinted circle of the
// player's `claimRadius` whenever it's above the base.
export const EXPANDER_CLAIM_RADII = [PLAYER_RADIUS * 4, 125, 180];

// Score = tiles owned x TILE_POINTS + kills x KILL_POINTS (0: kills don't score, since 2026-10-03)
// + the points of each structure owned
// (STRUCTURE_SPECS / structurePoints in shared/types.ts: a farm or fabricator is 100, a power plant
// 100, a Guard Tower 50, a Farmer's farm, Engineer's fabricator or Scientist's power plant 150). Materials are NOT part of the score.
export const TILE_POINTS = 1;
export const KILL_POINTS = 0;

// How often a player who hits their tile limit is told so (ms), while they keep walking over
// hexes they can't claim.
export const TILE_LIMIT_NOTICE_INTERVAL_MS = 8_000;

// Guard Tower: it fires the Blaster (damage and shot speed as for a player) at the nearest enemy
// player within range, as often as the interval allows, and never runs out of ammo.
// The Blaster was nerfed 2026-10-03 (50 -> 25 damage, 5 -> 1 shot a second); towers inherit it.
export const TOWER_RANGE = 450; // world px, center of the tower to the target
export const TOWER_FIRE_INTERVAL_MS = GUN_FIRE_INTERVAL_MS.basic; // the Blaster's rate

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
// The safe area around each player's own spawn spot, in hexes (2026-10-03: it was 3, for bots only):
// Guard Towers don't shoot a player inside it, and bots leave them alone, so nobody is shot as they
// respawn. Wider than SPAWN_CLEAR_RADIUS (the ground kept open for building).
export const SPAWN_SAFE_RADIUS = 6;

// Spawn line (see terrain.ts → spawnHex): one spawn hex per slot, in a column this many hexes in from
// the right-hand (east) edge. Slot 0 is the middle row; later slots alternate above and below it,
// SPAWN_ROW_SPACING rows apart. SPAWN_SLOTS is GameRoom's player limit (people and bots).
export const SPAWN_SLOTS = MAX_PLAYERS;
export const SPAWN_EDGE_INSET = 3;
export const SPAWN_ROW_SPACING = 6;

// Backpacks: when a defeated player's gun, ammo and upgrades drop where they fell, for them to pick
// up again (RespawnSystem). FEATURE FLAG: BACKPACKS_ENABLED, OFF by default (2026-10-03): by default
// a defeated player keeps everything. The BACKPACKS environment variable overrides it (BACKPACKS=1
// on, BACKPACKS=0 off), like PICKUPS. GameRoom copies it into GameState.dropBackpacks.
const BACKPACKS_DEFAULT = false;
export const BACKPACKS_ENABLED =
    process.env.BACKPACKS === undefined
        ? BACKPACKS_DEFAULT
        : !['0', 'false', 'off'].includes(process.env.BACKPACKS);

// Respawning: where a defeated player comes back. FEATURE FLAG: RESPAWN_WHERE_DIED_ENABLED, ON for
// now (2026-10-03): they respawn where they fell (moved to the nearest walkable hex if that spot is
// no good) instead of at their spawn spot. The RESPAWN_WHERE_DIED environment variable overrides it
// (=0 off, =1 on). GameRoom copies it into GameState.respawnWhereDied.
const RESPAWN_WHERE_DIED_DEFAULT = true;
export const RESPAWN_WHERE_DIED_ENABLED =
    process.env.RESPAWN_WHERE_DIED === undefined
        ? RESPAWN_WHERE_DIED_DEFAULT
        : !['0', 'false', 'off'].includes(process.env.RESPAWN_WHERE_DIED);

// Pickups: items scattered on the map when the room is created (see pickups.ts, PickupSystem.ts).
// FEATURE FLAG: PICKUPS_ENABLED turns them on or off. The PICKUPS environment variable overrides it
// (PICKUPS=0 off, PICKUPS=1 on), like TERRAIN_COVERAGE.
const PICKUPS_DEFAULT = true;
export const PICKUPS_ENABLED =
    process.env.PICKUPS === undefined
        ? PICKUPS_DEFAULT
        : !['0', 'false', 'off'].includes(process.env.PICKUPS);
// One location per cell of a grid over the map, each at
// its cell's center nudged up to PICKUP_JITTER hexes, then moved to the nearest hex that's ground
// and outside every spawn area.
// PICKUP_GRID is for the Small (64 x 64) map; bigger maps scale it with their size (pickups.ts →
// pickupGrid): 5 x 4 on Big, 6 x 5 on Large.
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
    { materials: 60, ammo: 25, upgrade: 5, basicGun: 5, bigGun: 3, structure: 2 },
    // tier 2
    { materials: 52, ammo: 20, upgrade: 10, basicGun: 8, bigGun: 5, structure: 5 },
    // tier 3
    { materials: 42, ammo: 15, upgrade: 15, basicGun: 10, bigGun: 8, structure: 10 },
    // tier 4: at the back
    { materials: 32, ammo: 10, upgrade: 20, basicGun: 10, bigGun: 10, structure: 18 },
];
export const PICKUP_MATERIALS = { min: 10, max: 50 };
export const PICKUP_AMMO = { min: 10, max: 30 };

// Bots: computer-controlled players, added in the lobby (see BotSystem and docs/GAME_DESIGN.md →
// Bots). Each difficulty is a profile of these knobs; distances are on-screen px (world y scaled
// by SCREEN_Y_SCALE), like shot range.
export interface BotProfile {
    thinkMs: number; // how often it re-decides where to go (steering follows its route every tick)
    speed: number; // how hard it pushes the stick, 0..1 (1 = top speed)
    searchDepth: number; // how many hexes away it looks for ground to claim or a pod to open
    goalNoise: number; // randomness in picking where to go (0 = always the best-looking spot)
    idleChance: number; // chance, each time it thinks, of dawdling for idleMs
    idleMs: number;
    reactionMs: number; // an enemy must be in its sights this long before it fires
    aimError: number; // radians: its shots stray up to this far either side
    lead: number; // 0..1: how much of a moving target's motion it aims ahead for
    fireIntervalMs: number; // at most one shot this often
    range: number; // it shoots at enemies this close (a shot flies 1,200)
    chaseRange: number; // armed, it goes after enemies this close (0 = never chases)
    keepDistance: number; // while chasing, it stops closing in at this distance
    strafe: boolean; // while chasing, it circles its target instead of standing still
    shootStructures: boolean; // it shoots enemy structures in range when no enemy player is
    retreatHealth: number; // below this share of its health it stops chasing
    shopMs: number; // how often it considers fabricating something
    ammoLow: number; // holding a gun, it fabricates ammo first when it has fewer shots than this
    // What it fabricates, in order: an upgrade listed twice means level 2, a structure listed twice
    // means two of them. With `saveUp` it waits for the next item on the list; without, it skips
    // to anything further down it can afford.
    shopPlan: ShopItemId[];
    saveUp: boolean;
    keepBuilding: boolean; // once the list is done, it fabricates a Guard Tower whenever it has none to place
    buildSites: boolean; // holding a structure, it claims the hexes a spot needs (else it only places where it happens to own the footprint)
    // Which upgrade it keeps in its slot: 'never' switches (keeps whatever equipped itself first),
    // 'expander' equips the Harvester once it has one, 'smart' also switches to the Booster to chase.
    equip: 'never' | 'expander' | 'smart';
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
    easy: {
        thinkMs: 600,
        speed: 0.75,
        searchDepth: 6,
        goalNoise: 1,
        idleChance: 0.05,
        idleMs: 1000,
        reactionMs: 1000,
        aimError: 0.35,
        lead: 0,
        fireIntervalMs: 800,
        range: 380,
        chaseRange: 0,
        keepDistance: 0,
        strafe: false,
        shootStructures: false,
        retreatHealth: 0,
        shopMs: 8000,
        ammoLow: 5,
        shopPlan: ['basicGun', 'armor', 'booster'],
        saveUp: false,
        keepBuilding: false,
        buildSites: false,
        equip: 'never',
    },
    medium: {
        thinkMs: 300,
        speed: 0.85,
        searchDepth: 8,
        goalNoise: 0.5,
        idleChance: 0,
        idleMs: 0,
        reactionMs: 500,
        aimError: 0.14,
        lead: 0.5,
        fireIntervalMs: 400,
        range: 520,
        chaseRange: 420,
        keepDistance: 200,
        strafe: false,
        shootStructures: true,
        retreatHealth: 0.3,
        shopMs: 3000,
        ammoLow: 10,
        shopPlan: [
            'basicGun',
            'armor',
            'expander',
            'guardTower',
            'booster',
            'bigGun',
            'armor',
            'guardTower',
        ],
        saveUp: true,
        keepBuilding: true,
        buildSites: true,
        equip: 'expander',
    },
    hard: {
        thinkMs: 150,
        speed: 1,
        searchDepth: 14,
        goalNoise: 0.08,
        idleChance: 0,
        idleMs: 0,
        reactionMs: 220,
        aimError: 0.05,
        lead: 1,
        fireIntervalMs: 250,
        range: 650,
        chaseRange: 650,
        keepDistance: 260,
        strafe: true,
        shootStructures: true,
        retreatHealth: 0.35,
        shopMs: 1000,
        ammoLow: 20,
        shopPlan: [
            'expander',
            'basicGun',
            'armor',
            'guardTower',
            'expander',
            'bigGun',
            'armor',
            'guardTower',
            'booster',
            'expander',
            'armor',
            'guardTower',
            'guardTower',
            'guardTower',
        ],
        saveUp: true,
        keepBuilding: true,
        buildSites: true,
        equip: 'smart',
    },
};

// Bots leave an enemy alone (don't chase or shoot them) while they're within this many hexes of
// their own spawn hex, so a bot can't camp a spawn point. People get no such protection from people.
export const BOT_SPAWN_MERCY_RADIUS = SPAWN_SAFE_RADIUS;

// Bots wait this long after the match starts before they do anything, so they don't get a head
// start on people whose game screen is still appearing.
export const BOT_START_DELAY_MS = 2_000 * PHASE_TIME_SCALE;

// Bots fire this many times slower than their gun and difficulty allow (2026-10-03: they were too
// good with guns; 2 means half the rate of fire). Applied in BotSystem to max(profile.fireIntervalMs,
// the gun's GUN_FIRE_INTERVAL_MS).
export const BOT_FIRE_INTERVAL_FACTOR = 2;

// Bots are named "Bot <name>", the first of these no player in the room has (then "Bot 11", ...).
export const BOT_NAMES = [
    'Cassini',
    'Huygens',
    'Kepler',
    'Tycho',
    'Halley',
    'Galileo',
    'Hubble',
    'Sagan',
    'Vega',
    'Rhea',
    'Mimas',
    'Dione',
];
