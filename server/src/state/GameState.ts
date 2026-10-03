import { Schema, MapSchema, ArraySchema, type, view } from '@colyseus/schema';
import {
    BASE_CLAIM_RADIUS,
    BASE_MAX_HEALTH,
    PROJECTILE_LIFETIME_MS,
    PROJECTILE_SPEED,
} from '../constants';
import {
    BASE_TILE_CAP,
    DEFAULT_CHARACTER,
    GUN_DAMAGE,
    STRUCTURE_HEALTH,
    TERRAIN,
    type GamePhase,
    type Terrain,
} from '../types/shared';
import type {
    GamePhaseStateShape,
    GameSettingsState,
    GameStateShape,
    BackpackState,
    MountainPieceState,
    PickupState,
    PlayerState,
    ProjectileState,
    StructureState,
    TileState,
} from '../../../shared/state';
import type { BotBrain } from '../bots/brain';

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
    @type('number') tileCap: number = BASE_TILE_CAP; // StructureSystem keeps it at 500 + 500 per farm
    @type('uint16') towersBuilt: number = 0; // standing Guard Towers (StructureSystem.refreshOwner)
    @type('boolean') hasFabricator: boolean = false; // owns a Fabricator: the Fabricator menu is open
    @type('number') kills: number = 0;
    @type('number') score: number = 0; // computed by ScoreSystem: tiles + structure points (kills are worth 0)
    @type('number') materials: number = 0;
    @type('number') claimRadius: number = BASE_CLAIM_RADIUS; // world px; larger with the Harvester equipped
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
    // Computer-controlled players (BotSystem): no client, always connected and ready.
    @type('boolean') bot: boolean = false;
    @type('string') botDifficulty: string = ''; // a BotDifficulty, or '' for a person
    // Defeated: waiting to respawn until this server time (ms); 0 = alive. See RespawnSystem.
    @type('number') respawnAt: number = 0;
    // Server only (not synced): when the player was last told they're at their tile limit (ms).
    tileLimitNoticeAt: number = 0;
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
    @type('number') speed: number = PROJECTILE_SPEED; // on-screen pixels/sec (see SCREEN_Y_SCALE)
    @type('number') spawnedAt: number = 0; // server timestamp ms, for lifetime expiry
    @type('number') damage: number = GUN_DAMAGE.basic; // set from the shooter's gun when fired
    // Server only (not synced): how long it flies before it vanishes (the gun's GUN_SHOT_LIFETIME_MS).
    lifetimeMs: number = PROJECTILE_LIFETIME_MS;
    // Server only (not synced): fired by a Guard Tower, so it passes through players in their spawn's safe area.
    fromTower = false;
}

export class Structure extends Schema implements StructureState {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('number') tileX: number = 0;
    @type('number') tileY: number = 0;
    @type('string') type: string = 'farm'; // a StructureType
    @type('uint8') rotation: number = 0; // 0-5, for the 3-hex Guard Tower only
    @type('number') health: number = STRUCTURE_HEALTH;
    @type('number') maxHealth: number = STRUCTURE_HEALTH;
    // Server only (not synced): a Guard Tower's next shot is allowed at this server time (ms).
    nextShotAt: number = 0;
}

export class Pickup extends Schema implements PickupState {
    @type('string') id: string = '';
    @type('number') tileX: number = 0;
    @type('number') tileY: number = 0;
    // Server only (not synced): which PICKUP_GRID cell it belongs to, so a respawn wave refills
    // only the cells that are empty.
    cell: number = -1;
}

/**
 * The weapons and upgrades a player dropped where they were defeated (RespawnSystem). Only its owner's
 * client gets it (GameState.backpacks is a view-filtered collection); the contents are server only.
 */
export class Backpack extends Schema implements BackpackState {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('uint8') tileX: number = 0;
    @type('uint8') tileY: number = 0;
    // Server only (not synced): what's inside.
    gun: string = '';
    ammo: number = 0;
    boosterLevel: number = 0;
    expanderLevel: number = 0;
    armorLevel: number = 0;
    wingsLevel: number = 0;
    equippedUpgrade: string = '';
}

/**
 * One mountain (terrain.ts → MountainPiece): its 3 or 7 hexes as tile indices, synced once so
 * clients can draw each mountain as one sprite.
 */
export class MountainPiece extends Schema implements MountainPieceState {
    @type('uint8') size: number = 3;
    @type(['uint16']) hexes = new ArraySchema<number>();
}

/** A pod waiting to appear in a respawn wave (server only). */
export interface PendingPod {
    col: number;
    row: number;
    cell: number;
    appearsAt: number; // server ms
}

/** The game's settings, fixed when it's created (see GameSettings in shared/types.ts). */
export class GameSettingsSchema extends Schema implements GameSettingsState {
    @type('string') name: string = '';
    @type('string') mapSize: string = 'small'; // a MapSizeId
    @type('boolean') teams: boolean = false;
    @type('boolean') pods: boolean = true;
    @type('uint8') matchMinutes: number = 5;
}

export class GamePhaseState extends Schema implements GamePhaseStateShape {
    @type('string') phase: GamePhase = 'lobby'; // lobby | countdown | playing | results
    @type('number') endsAt: number = 0; // server timestamp ms
}

// GameState checks everything but its seven collections: MapSchema/ArraySchema don't match
// ReadonlyMap / readonly T[] exactly for the compiler (they do structurally at runtime, which is
// what the client's cast relies on), and their element classes above are checked individually.
export class GameState
    extends Schema
    implements
        Omit<
            GameStateShape,
            | 'players'
            | 'structures'
            | 'projectiles'
            | 'pickups'
            | 'backpacks'
            | 'tiles'
            | 'mountains'
        >
{
    @type({ map: Player }) players = new MapSchema<Player>();
    // Server only (not synced): whether a defeated player's gear drops in a backpack (the
    // BACKPACKS_ENABLED flag; off by default, so they keep it).
    dropBackpacks = false;
    // Server only (not synced): whether a defeated player respawns where they fell (the
    // RESPAWN_WHERE_DIED_ENABLED flag) rather than at their spawn spot.
    respawnWhereDied = false;
    // Server only (not synced): when the `playing` phase began (ms), so bots can wait a moment (BOT_START_DELAY_MS).
    playingStartedAt = 0;
    @type({ map: Structure }) structures = new MapSchema<Structure>();
    @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
    @type({ map: Pickup }) pickups = new MapSchema<Pickup>(); // see pickups.ts; empty if the flag is off
    // Each client sees only its own backpacks: GameRoom gives every client a StateView and adds its
    // player's backpacks to it (see RespawnSystem and GameRoom.showBackpacks).
    @view() @type({ map: Backpack }) backpacks = new MapSchema<Backpack>();
    @type([Tile]) tiles = new ArraySchema<Tile>(); // flat array, index = y*width+x
    @type([MountainPiece]) mountains = new ArraySchema<MountainPiece>(); // set once, for drawing
    @type('string') theme: string = 'slate'; // a TerrainThemeId: the terrain's color scheme
    @type(GamePhaseState) phase = new GamePhaseState();
    @type(GameSettingsSchema) settings = new GameSettingsSchema();
    @type('number') mapWidth: number = 64;
    @type('number') mapHeight: number = 64;
    // Server only (not synced): pod respawn waves (PickupSystem). 0 = not scheduled yet.
    nextPodWaveAt: number = 0;
    pendingPods: PendingPod[] = [];
    podsMade: number = 0; // for unique pod ids
    shotsFired: number = 0; // for unique projectile ids
    botsMade: number = 0; // for unique bot ids
    backpacksMade: number = 0; // for unique backpack ids
    // Server only: what each bot is thinking (BotSystem), keyed by its player id.
    botBrains = new Map<string, BotBrain>();
}
