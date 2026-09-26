// Shared message shapes between client and server.
// Mirrors server/src/types/shared.ts exactly — keep both files in sync by hand
// (see docs/ARCHITECTURE.md "Message Shapes" section for the source of truth).

// lobby -> countdown (everyone connected is ready; cancelled back to lobby if that stops being
// true) -> playing -> results.
export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'results';

// Client -> Server
export interface InputMessage {
    // Desired movement direction in world space. Magnitude 0..1 is honored
    // (analog joystick), anything longer is clamped to 1 server-side.
    dir: { x: number; y: number };
    // Where the player is facing/aiming, radians in world space. Optional so
    // older clients that only send `dir` still work.
    angle?: number;
    seq: number;
}

export interface ShootMessage {
    angle: number;
    seq: number;
}

export interface PlaceStructureMessage {
    tileX: number;
    tileY: number;
    // Which structure from the player's inventory to place; one is used up.
    structureType: StructureType;
    seq: number;
}

// Client -> Server, lobby only (the `lobby` and `countdown` phases). Team and character changes
// are refused while the player is ready — un-ready first (the lobby UI locks those controls).
export interface SelectTeamMessage {
    teamId: TeamId;
}

export interface SelectCharacterMessage {
    characterId: CharacterId;
}

export interface SetReadyMessage {
    ready: boolean;
}

// Client -> Server, lobby only (not locked by being ready). Normalized and checked with
// normalizePlayerName; if another player already has the name, the server adds " (1)", " (2)"...
export interface SetNameMessage {
    name: string;
}

// Options sent with joinOrCreate. `name` is the player's saved name (localStorage), if any.
export interface JoinOptions {
    name?: string;
}

// --- Player names ------------------------------------------------------------------------------
// Keep this block identical on both sides too.
export const PLAYER_NAME_MIN_LENGTH = 2;
export const PLAYER_NAME_MAX_LENGTH = 25;

/** Counts characters the way people do (an emoji is one), not UTF-16 code units. */
export function nameLength(name: string): number {
    return Array.from(name).length;
}

/**
 * The cleaned-up name (whitespace runs collapsed to one space, control characters removed,
 * trimmed), or null if it isn't a string or is shorter than PLAYER_NAME_MIN_LENGTH or longer than
 * PLAYER_NAME_MAX_LENGTH characters once cleaned up. Any other characters are allowed.
 */
export function normalizePlayerName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value
        .replace(/\s+/g, ' ')
        .replace(/\p{Cc}/gu, '')
        .trim();
    const length = nameLength(name);
    return length >= PLAYER_NAME_MIN_LENGTH && length <= PLAYER_NAME_MAX_LENGTH ? name : null;
}

// Server -> Client, sent to the originating client only (not broadcast) —
// lets the client discard predicted inputs up to this seq once confirmed.
export interface InputAckEvent {
    seq: number;
}

// Server -> Client (discrete events; state deltas are handled by Colyseus itself)
export interface PlayerHitEvent {
    targetId: string;
    damage: number;
    shooterId: string;
}

export interface TilesClaimedEvent {
    tiles: Array<{ x: number; y: number; ownerId: string }>;
}

export interface StructureDestroyedEvent {
    structureId: string;
}

export interface PhaseChangedEvent {
    phase: GamePhase;
    endsAt: number;
}

// Sent to everyone when a player's connection drops without them leaving on purpose. Their
// player, tiles and structures stay put (frozen) for `reconnectWindowMs`.
export interface PlayerDisconnectedEvent {
    playerId: string;
    name: string;
    reconnectWindowMs: number;
}

// Sent to everyone else when a dropped player gets back in within their window.
export interface PlayerReconnectedEvent {
    playerId: string;
    name: string;
}

// One player's final standing.
export interface FinalScore {
    playerId: string;
    name: string;
    color: string;
    teamId: TeamId | '';
    score: number;
    tilesOwned: number;
    kills: number;
    structures: number;
}

// Sent once when the match ends (phase -> results): the final standings, best first. Clients keep
// it so the results screen stays up after the room closes.
export interface GameOverEvent {
    scores: FinalScore[];
}

// --- Shop --------------------------------------------------------------------------------------
// The catalog is shared so the server (validation) and client (menu) always agree on prices.
// Keep this block identical in server/src/types/shared.ts and client/src/types/shared.ts.
export type ShopItemId = 'ammo' | 'basicGun' | 'expander';

export interface ShopItem {
    id: ShopItemId;
    name: string;
    description: string;
    cost: number; // credits
}

export const AMMO_PACK_SIZE = 30; // shots per purchase
export const AMMO_CREDITS_PER_SHOT = 1;

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
    ammo: {
        id: 'ammo',
        name: 'Ammo pack',
        description: `${AMMO_PACK_SIZE} shots (${AMMO_CREDITS_PER_SHOT} credit per shot)`,
        cost: AMMO_PACK_SIZE * AMMO_CREDITS_PER_SHOT,
    },
    basicGun: {
        id: 'basicGun',
        name: 'Basic gun',
        description: 'Lets you shoot (you still need ammo). One per player.',
        cost: 40,
    },
    expander: {
        id: 'expander',
        name: 'Expander',
        description: 'Claim hexes in a much larger radius. One per player.',
        cost: 100,
    },
};

export function isShopItemId(value: unknown): value is ShopItemId {
    return typeof value === 'string' && Object.hasOwn(SHOP_ITEMS, value);
}

// Client -> Server: buy an item (allowed during the `playing` phase only).
export interface PurchaseMessage {
    itemId: ShopItemId;
}

// --- Teams -------------------------------------------------------------------------------------
// A team is a color: players who pick the same one are allies (no friendly fire, they can walk
// through each other's structures and don't take each other's tiles). Tiles, credits and score
// stay per player. Keep this block identical on both sides too.
export type TeamId = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'teal' | 'orange' | 'gray';

export interface Team {
    id: TeamId;
    name: string;
    color: string;
}

export const TEAMS: Record<TeamId, Team> = {
    red: { id: 'red', name: 'Red', color: '#e74c3c' },
    blue: { id: 'blue', name: 'Blue', color: '#3498db' },
    green: { id: 'green', name: 'Green', color: '#2ecc71' },
    yellow: { id: 'yellow', name: 'Yellow', color: '#f1c40f' },
    purple: { id: 'purple', name: 'Purple', color: '#9b59b6' },
    teal: { id: 'teal', name: 'Teal', color: '#1abc9c' },
    orange: { id: 'orange', name: 'Orange', color: '#e67e22' },
    gray: { id: 'gray', name: 'Gray', color: '#95a5a6' },
};

export const TEAM_IDS = Object.keys(TEAMS) as TeamId[];

export function isTeamId(value: unknown): value is TeamId {
    return typeof value === 'string' && Object.hasOwn(TEAMS, value);
}

// --- Characters --------------------------------------------------------------------------------
// Picked in the lobby; the server applies the starting kit when the match starts. Structure types
// all behave the same for now. Keep this block identical on both sides too.
export type StructureType = 'farm' | 'mine' | 'fort' | 'power';
export type GunId = 'basic';
export type UpgradeId = 'boost';
export type CharacterId = 'farmer' | 'miner' | 'builder' | 'robot' | 'scientist' | 'smuggler';

export interface Character {
    id: CharacterId;
    name: string;
    description: string;
    gun: GunId | null; // null = unarmed (can't shoot until they buy a gun)
    ammo: number;
    structures: StructureType[]; // starting structure inventory, one entry per structure
    credits: number;
    upgrades: UpgradeId[];
}

export const STRUCTURE_NAMES: Record<StructureType, string> = {
    farm: 'Farm',
    mine: 'Mine',
    fort: 'Fort',
    power: 'Power plant',
};

export const GUN_NAMES: Record<GunId, string> = { basic: 'Basic gun' };

export const UPGRADE_NAMES: Record<UpgradeId, string> = { boost: 'Speed boost' };

export const DEFAULT_CHARACTER: CharacterId = 'farmer';

export const CHARACTERS: Record<CharacterId, Character> = {
    farmer: {
        id: 'farmer',
        name: 'Farmer',
        description: 'Starts with a farm.',
        gun: null,
        ammo: 0,
        structures: ['farm'],
        credits: 50,
        upgrades: [],
    },
    miner: {
        id: 'miner',
        name: 'Miner',
        description: 'Starts with a mine.',
        gun: null,
        ammo: 0,
        structures: ['mine'],
        credits: 50,
        upgrades: [],
    },
    builder: {
        id: 'builder',
        name: 'Builder',
        description: 'Starts with a fort.',
        gun: null,
        ammo: 0,
        structures: ['fort'],
        credits: 50,
        upgrades: [],
    },
    robot: {
        id: 'robot',
        name: 'Robot',
        description: 'Moves faster than everyone else.',
        gun: null,
        ammo: 0,
        structures: [],
        credits: 50,
        upgrades: ['boost'],
    },
    scientist: {
        id: 'scientist',
        name: 'Scientist',
        description: 'Starts with a power plant.',
        gun: null,
        ammo: 0,
        structures: ['power'],
        credits: 50,
        upgrades: [],
    },
    smuggler: {
        id: 'smuggler',
        name: 'Smuggler',
        description: 'The only one who starts armed, but with few credits.',
        gun: 'basic',
        ammo: 15,
        structures: [],
        credits: 15,
        upgrades: [],
    },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(value: unknown): value is CharacterId {
    return typeof value === 'string' && Object.hasOwn(CHARACTERS, value);
}

export function isStructureType(value: unknown): value is StructureType {
    return typeof value === 'string' && Object.hasOwn(STRUCTURE_NAMES, value);
}
