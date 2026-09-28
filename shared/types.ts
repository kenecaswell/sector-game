// Everything the client and server must agree on about the protocol and the game's catalogs:
// message and event shapes, the shop, teams, characters and player-name rules. The one copy —
// server/src/types/shared.ts and client/src/types/shared.ts just re-export it.
// Mirrors the "Message Shapes" section of docs/ARCHITECTURE.md.

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

// Options sent when joining or creating a game. `name` is the player's saved name (localStorage),
// if any. `game` only matters when creating one (client.create): its settings, cleaned up by
// normalizeGameSettings on the server.
export interface JoinOptions {
    name?: string;
    game?: Partial<GameSettings>;
}

// --- Games (rooms) -----------------------------------------------------------------------------
// Each game is a room with its own settings, picked on the Create game screen. Its code is the
// Colyseus room id (GAME_CODE_LENGTH characters from GAME_CODE_ALPHABET), shown in the game list
// and used in its URL (/game/CODE).
export type MapSizeId = 'small' | 'big' | 'large';

export const MAP_SIZES: Record<MapSizeId, { name: string; cols: number; rows: number }> = {
    small: { name: 'Small', cols: 64, rows: 64 },
    big: { name: 'Big', cols: 80, rows: 80 },
    large: { name: 'Large', cols: 96, rows: 96 },
};
export const MAP_SIZE_IDS = Object.keys(MAP_SIZES) as MapSizeId[];
export const MATCH_LENGTH_OPTIONS = [5, 7, 10]; // minutes
export const GAME_NAME_MAX_LENGTH = 30;
export const GAME_CODE_LENGTH = 4;
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I

export interface GameSettings {
    name: string; // shown in the game list; '' = the server names it
    mapSize: MapSizeId;
    teams: boolean; // may players team up (pick a team color)? If not, everyone is on their own
    pods: boolean; // drop pods (also needs the server's PICKUPS_ENABLED flag)
    matchMinutes: number; // one of MATCH_LENGTH_OPTIONS
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    name: '',
    mapSize: 'small',
    teams: false,
    pods: true,
    matchMinutes: 5,
};

/** Settings from untrusted input: anything missing or invalid takes its default. */
export function normalizeGameSettings(raw: unknown): GameSettings {
    const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_GAME_SETTINGS;
    const name =
        typeof input.name === 'string'
            ? input.name.replace(/\s+/g, ' ').trim().slice(0, GAME_NAME_MAX_LENGTH)
            : '';
    return {
        name,
        mapSize: MAP_SIZE_IDS.includes(input.mapSize as MapSizeId)
            ? (input.mapSize as MapSizeId)
            : d.mapSize,
        teams: typeof input.teams === 'boolean' ? input.teams : d.teams,
        pods: typeof input.pods === 'boolean' ? input.pods : d.pods,
        matchMinutes: MATCH_LENGTH_OPTIONS.includes(input.matchMinutes as number)
            ? (input.matchMinutes as number)
            : d.matchMinutes,
    };
}

/** Whether `value` looks like a game code (case-insensitive); returns it upper-cased, or null. */
export function normalizeGameCode(value: string): string | null {
    const code = value.trim().toUpperCase();
    if (code.length !== GAME_CODE_LENGTH) return null;
    return [...code].every((c) => GAME_CODE_ALPHABET.includes(c)) ? code : null;
}

// One game in the list (GET /games on the server): the open, unfinished ones.
export interface GameListing extends GameSettings {
    code: string;
    players: number;
    maxPlayers: number;
    phase: GamePhase;
}

// --- Player names ------------------------------------------------------------------------------
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

// --- Teams -------------------------------------------------------------------------------------
// A team is a color: players who pick the same one are allies (no friendly fire, they can walk
// through each other's structures and don't take each other's tiles). Tiles, materials and score
// stay per player.
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
// all behave the same for now.
export type StructureType = 'farm' | 'fabricator' | 'fort' | 'power';
export type GunId = 'basic' | 'big';
export type UpgradeId = 'booster' | 'expander' | 'armor' | 'wings';
export type CharacterId = 'farmer' | 'miner' | 'builder' | 'robot' | 'scientist' | 'explorer';

export interface Character {
    id: CharacterId;
    name: string;
    description: string;
    gun: GunId | null; // null = unarmed (can't shoot until they buy a gun)
    ammo: number;
    structures: StructureType[]; // starting structure inventory, one entry per structure
    materials: number;
    upgrades: Partial<Record<UpgradeId, number>>; // starting level of each upgrade it has
    equipped?: UpgradeId; // the slot upgrade it starts with equipped
}

export const STRUCTURE_NAMES: Record<StructureType, string> = {
    farm: 'Farm',
    fabricator: 'Fabricator',
    fort: 'Fort',
    power: 'Power plant',
};

export const GUN_NAMES: Record<GunId, string> = { basic: 'Basic gun', big: 'Big gun' };

// Damage per hit. Players have 100 health, +100 per Armor level.
export const GUN_DAMAGE: Record<GunId, number> = { basic: 50, big: 100 };

export function isGunId(value: unknown): value is GunId {
    return typeof value === 'string' && Object.hasOwn(GUN_NAMES, value);
}

// --- Upgrades ----------------------------------------------------------------------------------
// Bought in the shop a level at a time. A player has one upgrade *slot*: of the slot upgrades
// (Booster, Expander, Wings) only the equipped one has an effect, and switching has a cooldown.
// Armor isn't a slot upgrade: it always works once bought. See docs/GAME_DESIGN.md → Upgrades.
export interface UpgradeInfo {
    id: UpgradeId;
    name: string;
    maxLevel: number;
    slot: boolean; // true = only works while equipped
}

export const UPGRADES: Record<UpgradeId, UpgradeInfo> = {
    booster: { id: 'booster', name: 'Booster', maxLevel: 3, slot: true },
    expander: { id: 'expander', name: 'Expander', maxLevel: 3, slot: true },
    armor: { id: 'armor', name: 'Armor', maxLevel: 3, slot: false },
    wings: { id: 'wings', name: 'Wings', maxLevel: 1, slot: true },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export const UPGRADE_NAMES = Object.fromEntries(
    UPGRADE_IDS.map((id) => [id, UPGRADES[id].name])
) as Record<UpgradeId, string>;

export function isUpgradeId(value: unknown): value is UpgradeId {
    return typeof value === 'string' && Object.hasOwn(UPGRADES, value);
}

export const BOOSTER_SPEED_PER_LEVEL = 0.25; // +25% of base top speed per level: 125/150/175%
export const ARMOR_HEALTH_PER_LEVEL = 100; // +100 max health per level: 200/300/400
export const EXPANDER_HEXES = [7, 19, 37]; // hexes claimed at once, standing mid-hex, per level

/** A player's upgrade levels (0 = not owned) and which slot upgrade is equipped ('' = none). */
export interface UpgradeHolder {
    boosterLevel: number;
    expanderLevel: number;
    armorLevel: number;
    wingsLevel: number;
    equippedUpgrade: string;
}

export function upgradeLevel(player: UpgradeHolder, id: UpgradeId): number {
    return player[`${id}Level`];
}

/** The level of `id` that's in effect: its level if it's Armor or equipped, else 0. */
export function activeUpgradeLevel(player: UpgradeHolder, id: UpgradeId): number {
    return UPGRADES[id].slot && player.equippedUpgrade !== id ? 0 : upgradeLevel(player, id);
}

/** "Booster 2" (or just "Wings" for a single-level upgrade). */
export function upgradeLabel(id: UpgradeId, level: number): string {
    return UPGRADES[id].maxLevel > 1 ? `${UPGRADES[id].name} ${level}` : UPGRADES[id].name;
}

/** What `id` does at `level`. */
export function upgradeEffect(id: UpgradeId, level: number): string {
    switch (id) {
        case 'booster':
            return `${100 + level * BOOSTER_SPEED_PER_LEVEL * 100}% of normal speed.`;
        case 'expander':
            return `Claim ${EXPANDER_HEXES[level - 1]} hexes at once, standing mid-hex.`;
        case 'armor':
            return `${100 + level * ARMOR_HEALTH_PER_LEVEL} max health. Always on, no slot needed.`;
        case 'wings':
            return "Walk over mountains and deep water. You still can't claim them.";
    }
}

export const DEFAULT_CHARACTER: CharacterId = 'farmer';

export const CHARACTERS: Record<CharacterId, Character> = {
    farmer: {
        id: 'farmer',
        name: 'Farmer',
        description: 'Starts with a farm.',
        gun: null,
        ammo: 0,
        structures: ['farm'],
        materials: 50,
        upgrades: {},
    },
    miner: {
        id: 'miner',
        name: 'Miner',
        description: 'Starts with a fabricator.',
        gun: null,
        ammo: 0,
        structures: ['fabricator'],
        materials: 50,
        upgrades: {},
    },
    builder: {
        id: 'builder',
        name: 'Builder',
        description: 'Starts with a fort.',
        gun: null,
        ammo: 0,
        structures: ['fort'],
        materials: 50,
        upgrades: {},
    },
    robot: {
        id: 'robot',
        name: 'Robot',
        description: 'Moves faster than everyone else.',
        gun: null,
        ammo: 0,
        structures: [],
        materials: 50,
        upgrades: { booster: 1 },
        equipped: 'booster',
    },
    scientist: {
        id: 'scientist',
        name: 'Scientist',
        description: 'Starts with a power plant.',
        gun: null,
        ammo: 0,
        structures: ['power'],
        materials: 50,
        upgrades: {},
    },
    explorer: {
        id: 'explorer',
        name: 'Explorer',
        description: 'The only one who starts armed, but with few materials.',
        gun: 'basic',
        ammo: 15,
        structures: [],
        materials: 15,
        upgrades: {},
    },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(value: unknown): value is CharacterId {
    return typeof value === 'string' && Object.hasOwn(CHARACTERS, value);
}

export function isStructureType(value: unknown): value is StructureType {
    return typeof value === 'string' && Object.hasOwn(STRUCTURE_NAMES, value);
}

// --- Shop --------------------------------------------------------------------------------------
// The catalog is shared so the server (validation) and client (menu) always agree on prices and
// on what you already own. Each item says what it gives; ShopSystem applies it.
export type ShopItemId =
    | 'basicGun'
    | 'bigGun'
    | 'ammo'
    | 'booster'
    | 'armor'
    | 'expander'
    | 'wings'
    | 'farm'
    | 'fabricator'
    | 'fort'
    | 'power';

export type ShopCategory = 'weapons' | 'upgrades' | 'structures';

export const SHOP_CATEGORY_NAMES: Record<ShopCategory, string> = {
    weapons: 'Weapons',
    upgrades: 'Upgrades',
    structures: 'Structures',
};

export interface ShopItem {
    id: ShopItemId;
    category: ShopCategory;
    name: string;
    description: string;
    cost: number; // materials
    // What buying it gives you (exactly one of these):
    gun?: GunId; // replaces your gun
    ammo?: number; // adds shots
    upgrade?: UpgradeId; // the next level of it (up to its maxLevel); `cost` is per level
    structure?: StructureType; // adds one to your structure inventory (buy as many as you like)
}

export const AMMO_PACK_SIZE = 30; // shots per purchase
export const AMMO_MATERIALS_PER_SHOT = 1;
export const STRUCTURE_COST = 100;

const UPGRADE_COST = 100; // materials per level

// One shop entry per upgrade; it always offers your next level (see shopItemTitle).
const upgradeItem = (id: UpgradeId): ShopItem => ({
    id,
    category: 'upgrades',
    name: UPGRADES[id].name,
    description: upgradeEffect(id, 1),
    cost: UPGRADE_COST,
    upgrade: id,
});

const structureItem = (id: StructureType): ShopItem => ({
    id,
    category: 'structures',
    name: STRUCTURE_NAMES[id],
    description: 'One more to place. Needs 7 hexes of your own.',
    cost: STRUCTURE_COST,
    structure: id,
});

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
    basicGun: {
        id: 'basicGun',
        category: 'weapons',
        name: GUN_NAMES.basic,
        description: `Lets you shoot (you still need ammo). ${GUN_DAMAGE.basic} damage per hit.`,
        cost: 100,
        gun: 'basic',
    },
    bigGun: {
        id: 'bigGun',
        category: 'weapons',
        name: GUN_NAMES.big,
        description: `${GUN_DAMAGE.big} damage per hit (double). Replaces the basic gun.`,
        cost: 200,
        gun: 'big',
    },
    ammo: {
        id: 'ammo',
        category: 'weapons',
        name: 'Ammo pack',
        description: `${AMMO_PACK_SIZE} shots (${AMMO_MATERIALS_PER_SHOT} material per shot)`,
        cost: AMMO_PACK_SIZE * AMMO_MATERIALS_PER_SHOT,
        ammo: AMMO_PACK_SIZE,
    },
    booster: upgradeItem('booster'),
    expander: upgradeItem('expander'),
    armor: upgradeItem('armor'),
    wings: upgradeItem('wings'),
    farm: structureItem('farm'),
    fabricator: structureItem('fabricator'),
    fort: structureItem('fort'),
    power: structureItem('power'),
};

export const SHOP_ITEM_IDS = Object.keys(SHOP_ITEMS) as ShopItemId[];

export function isShopItemId(value: unknown): value is ShopItemId {
    return typeof value === 'string' && Object.hasOwn(SHOP_ITEMS, value);
}

/** What the shop needs to know about a player to show and validate items. */
export type ShopCustomer = UpgradeHolder & { gun: string };

/**
 * True if buying `itemId` would get the player nothing: an upgrade already at its top level, or a
 * gun that isn't better than theirs (the basic gun once you have any gun, the big gun once you
 * have it). Ammo and structures can always be bought again. The server refuses these purchases;
 * the menu shows them as owned.
 */
export function ownsShopItem(player: ShopCustomer, itemId: ShopItemId): boolean {
    const item = SHOP_ITEMS[itemId];
    if (item.upgrade) return upgradeLevel(player, item.upgrade) >= UPGRADES[item.upgrade].maxLevel;
    if (item.gun === 'basic') return player.gun !== '';
    if (item.gun === 'big') return player.gun === 'big';
    return false;
}

/** The shop's name for an item for this player: upgrades show the level on offer ("Booster 2"). */
export function shopItemTitle(player: ShopCustomer, itemId: ShopItemId): string {
    const item = SHOP_ITEMS[itemId];
    if (!item.upgrade) return item.name;
    const next = Math.min(upgradeLevel(player, item.upgrade) + 1, UPGRADES[item.upgrade].maxLevel);
    return upgradeLabel(item.upgrade, next);
}

/** The shop's description for this player: for upgrades, what the level on offer does. */
export function shopItemDescription(player: ShopCustomer, itemId: ShopItemId): string {
    const item = SHOP_ITEMS[itemId];
    if (!item.upgrade) return item.description;
    const next = Math.min(upgradeLevel(player, item.upgrade) + 1, UPGRADES[item.upgrade].maxLevel);
    return upgradeEffect(item.upgrade, next);
}

// Client -> Server: buy an item (allowed during the `playing` phase only).
export interface PurchaseMessage {
    itemId: ShopItemId;
}

// Client -> Server: equip a slot upgrade you own, or '' to leave the slot empty (playing phase only;
// refused during the cooldown, and refused for leaving Wings while over a mountain or deep water).
export interface EquipUpgradeMessage {
    upgradeId: UpgradeId | '';
}

// --- Terrain -----------------------------------------------------------------------------------
// Each hex's terrain, synced once as a byte per tile (Tile.terrain). The server generates a new
// layout for every match (server/src/terrain.ts); see docs/GAME_DESIGN.md → Terrain for the rules.
export const TERRAIN = { ground: 0, mountain: 1, water: 2 } as const;
export type Terrain = (typeof TERRAIN)[keyof typeof TERRAIN];

// --- Pickups -----------------------------------------------------------------------------------
// Identical drop pods lying on the map, placed when the room is created (server/src/pickups.ts)
// when the PICKUPS_ENABLED feature flag is on. Walk onto one's hex to open it (see PickupSystem):
// its contents are rolled then, for your score tier, and only then sent to clients. A pile of
// materials or ammo has an `amount`; an item gives what its Fabricator item gives, for free.
export type PickupKind = 'materials' | 'ammo' | 'item';

// Server -> Client: a player opened a drop pod, and what was inside (it has gone from `state.pickups`).
export interface PickupCollectedEvent {
    playerId: string;
    kind: PickupKind;
    itemId: ShopItemId | ''; // for kind 'item'
    amount: number; // for 'materials' and 'ammo'
}

/** What a pickup is, in words: "30 materials", "12 ammo", "Booster 1", "Basic gun", "Farm". */
export function pickupLabel(kind: PickupKind, itemId: string, amount: number): string {
    if (kind === 'materials') return `${amount} materials`;
    if (kind === 'ammo') return `${amount} ammo`;
    if (!isShopItemId(itemId)) return 'an item';
    const item = SHOP_ITEMS[itemId];
    return item.upgrade ? upgradeLabel(item.upgrade, 1) : item.name;
}
