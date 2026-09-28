import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import { BASE_CLAIM_RADIUS, BASE_MAX_HEALTH } from '../constants';
import {
    DEFAULT_CHARACTER,
    GUN_DAMAGE,
    TERRAIN,
    type GamePhase,
    type Terrain,
} from '../types/shared';
import type {
    GamePhaseStateShape,
    GameStateShape,
    PickupState,
    PlayerState,
    ProjectileState,
    StructureState,
    TileState,
} from '../../../shared/state';

// Each class implements its interface in shared/state.ts (what the client reads), so dropping or
// retyping a field the client relies on is a compile error here.

export class Player extends Schema implements PlayerState {
    @type('string') id: string = '';
    @type('string') name: string = '';
    @type('number') x: number = 0;
    @type('number') y: number = 0;
    @type('number') vx: number = 0; // px/sec — synced so clients can extrapolate smoothly between ticks
    @type('number') vy: number = 0;
    @type('number') angle: number = 0; // facing/aim direction in radians (world space)
    @type('number') health: number = BASE_MAX_HEALTH;
    @type('number') maxHealth: number = BASE_MAX_HEALTH; // + ARMOR_HEALTH_PER_LEVEL per Armor level
    // Ammo, materials, gun, structure inventory and upgrades are all set from the chosen character's
    // starting kit when the match starts (CharacterSystem); these defaults only matter in the lobby.
    @type('number') ammo: number = 0;
    @type('number') tilesOwned: number = 0;
    @type('number') kills: number = 0;
    @type('number') score: number = 0; // computed by ScoreSystem: tiles + kills x 50 + structures
    @type('number') materials: number = 0;
    @type('number') claimRadius: number = BASE_CLAIM_RADIUS; // world px; larger with the Expander equipped
    @type('boolean') connected: boolean = true;
    @type('string') color: string = ''; // always the team's color (TEAMS in types/shared.ts)
    @type('string') teamId: string = ''; // a TeamId; players on the same team are allies
    @type('string') character: string = DEFAULT_CHARACTER; // a CharacterId, picked in the lobby
    @type('boolean') ready: boolean = false; // lobby only: the match starts when everyone is ready
    @type('string') gun: string = ''; // a GunId, or '' = unarmed (can't shoot)
    @type(['string']) structureInventory = new ArraySchema<string>(); // StructureTypes left to place
    // Upgrade levels (0 = not owned) and the one equipped slot upgrade; see UpgradeSystem.
    @type('uint8') boosterLevel: number = 0;
    @type('uint8') expanderLevel: number = 0;
    @type('uint8') armorLevel: number = 0;
    @type('uint8') wingsLevel: number = 0;
    @type('string') equippedUpgrade: string = ''; // an UpgradeId with `slot: true`, or '' for none
    // The hex this player starts and respawns on, for the client's spawn platform.
    @type('uint8') spawnTileX: number = 0;
    @type('uint8') spawnTileY: number = 0;
    // Server only (not synced): which spawn-line slot this player starts and respawns at.
    spawnSlot: number = 0;
}

export class Tile extends Schema implements TileState {
    @type('string') ownerId: string = ''; // empty string = unclaimed
    @type('uint8') terrain: Terrain = TERRAIN.ground; // set once when the room is created (terrain.ts)
    // Server only (not synced): someone has claimed this hex this match, so it pays no more materials.
    claimedBefore: boolean = false;
}

export class Projectile extends Schema implements ProjectileState {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('number') x: number = 0;
    @type('number') y: number = 0;
    @type('number') angle: number = 0;
    @type('number') speed: number = 400; // on-screen pixels/sec (see SCREEN_Y_SCALE)
    @type('number') spawnedAt: number = 0; // server timestamp ms, for lifetime expiry
    @type('number') damage: number = GUN_DAMAGE.basic; // set from the shooter's gun when fired
}

export class Structure extends Schema implements StructureState {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('number') tileX: number = 0;
    @type('number') tileY: number = 0;
    @type('string') type: string = 'fort'; // a StructureType; all types behave the same for now
    @type('number') health: number = 100;
    @type('number') maxHealth: number = 100;
}

export class Pickup extends Schema implements PickupState {
    @type('string') id: string = '';
    @type('number') tileX: number = 0;
    @type('number') tileY: number = 0;
    // Server only (not synced): which PICKUP_GRID cell it belongs to, so a respawn wave refills
    // only the cells that are empty.
    cell: number = -1;
}

/** A pod waiting to appear in a respawn wave (server only). */
export interface PendingPod {
    col: number;
    row: number;
    cell: number;
    appearsAt: number; // server ms
}

export class GamePhaseState extends Schema implements GamePhaseStateShape {
    @type('string') phase: GamePhase = 'lobby'; // lobby | countdown | playing | results
    @type('number') endsAt: number = 0; // server timestamp ms
}

// GameState checks everything but its five collections: MapSchema/ArraySchema don't match
// ReadonlyMap / readonly T[] exactly for the compiler (they do structurally at runtime, which is
// what the client's cast relies on), and their element classes above are checked individually.
export class GameState
    extends Schema
    implements Omit<GameStateShape, 'players' | 'structures' | 'projectiles' | 'pickups' | 'tiles'>
{
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Structure }) structures = new MapSchema<Structure>();
    @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
    @type({ map: Pickup }) pickups = new MapSchema<Pickup>(); // see pickups.ts; empty if the flag is off
    @type([Tile]) tiles = new ArraySchema<Tile>(); // flat array, index = y*width+x
    @type(GamePhaseState) phase = new GamePhaseState();
    @type('number') mapWidth: number = 64;
    @type('number') mapHeight: number = 64;
    // Server only (not synced): pod respawn waves (PickupSystem). 0 = not scheduled yet.
    nextPodWaveAt: number = 0;
    pendingPods: PendingPod[] = [];
    podsMade: number = 0; // for unique pod ids
}
