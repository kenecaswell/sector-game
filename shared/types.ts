// Everything the client and server must agree on about the protocol and the game's catalogs:
// message and event shapes, the shop, teams, characters and player-name rules. The one copy —
// server/src/types/shared.ts and client/src/types/shared.ts just re-export it.
// Mirrors the "Message Shapes" section of docs/ARCHITECTURE.md.

import { footprintHexes, inFootprint, type HexCoord } from './hex';

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
    // How a 3-hex structure (the Guard Tower) is turned, 0-5 (see `compactFootprint`). Ignored for
    // the 7-hex structures, and 0 when left out.
    rotation?: number;
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

// Client -> Server, lobby phase only (not the countdown): computer-controlled players. Any player
// in the lobby may add, change or remove bots (there's no host). Bots are always ready, so a lone
// player plus bots is a single-player game. See docs/GAME_DESIGN.md → Bots.
export interface AddBotMessage {
    difficulty: BotDifficulty;
}

export interface RemoveBotMessage {
    botId: string;
}

// Only the fields given are changed. `teamId` follows the same rules as a player's own pick (with
// teams off, a color nobody else has).
export interface UpdateBotMessage {
    botId: string;
    difficulty?: BotDifficulty;
    teamId?: TeamId;
    characterId?: CharacterId;
}

// --- Bots --------------------------------------------------------------------------------------
// How well a bot plays. The server's tunables for each are BOT_PROFILES in server/src/constants.ts.
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export const BOT_DIFFICULTIES: Record<BotDifficulty, { name: string; description: string }> = {
    easy: {
        name: 'Easy',
        description: 'Slow to react, a poor shot, and wanders. Rarely fabricates anything.',
    },
    medium: {
        name: 'Medium',
        description: 'Claims steadily, fabricates a gun early and fights what comes close.',
    },
    hard: {
        name: 'Hard',
        description: 'Claims efficiently, builds, leads its shots and hunts nearby players.',
    },
};

export const BOT_DIFFICULTY_IDS = Object.keys(BOT_DIFFICULTIES) as BotDifficulty[];
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'medium';

export function isBotDifficulty(value: unknown): value is BotDifficulty {
    return typeof value === 'string' && Object.hasOwn(BOT_DIFFICULTIES, value);
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

// `maxGuardTowers` is how many Guard Towers one player may have (built and held, not yet placed)
// on that map: 10 on the default Small map, and more on bigger ones in step with their area
// (1.56x and 2.25x, rounded).
export const MAP_SIZES: Record<
    MapSizeId,
    { name: string; cols: number; rows: number; maxGuardTowers: number }
> = {
    small: { name: 'Small', cols: 64, rows: 64, maxGuardTowers: 10 },
    big: { name: 'Big', cols: 80, rows: 80, maxGuardTowers: 16 },
    large: { name: 'Large', cols: 96, rows: 96, maxGuardTowers: 23 },
};

/** The most Guard Towers a player may have in a game on this map size (Small's if unknown). */
export function maxGuardTowers(mapSize: string): number {
    return (MAP_SIZES[mapSize as MapSizeId] ?? MAP_SIZES.small).maxGuardTowers;
}
export const MAP_SIZE_IDS = Object.keys(MAP_SIZES) as MapSizeId[];
export const MATCH_LENGTH_OPTIONS = [5, 7, 10]; // minutes
export const MAX_PLAYERS = 10; // people and bots together (one spawn slot each)
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
    players: number; // bots included
    bots: number;
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
    kills: number; // not part of the score (KILL_POINTS is 0), but still shown
    structures: number;
    structurePoints: number; // what those structures add to the score (a specialist's own type counts 150, SPECIALTIES)
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
// Picked in the lobby; the server applies the starting kit when the match starts.
export type GunId = 'basic' | 'big';
export type UpgradeId = 'booster' | 'expander' | 'armor' | 'wings';
export type CharacterId = 'farmer' | 'engineer' | 'robot' | 'scientist' | 'explorer';

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

// --- Structures --------------------------------------------------------------------------------
// What each structure type costs, how tough it is, how many points it scores and how big it is.
// See docs/GAME_DESIGN.md → Structures. (`STRUCTURE_TYPES` below is in catalog order.)
export type StructureType = 'farm' | 'fabricator' | 'guardTower' | 'power';

export interface StructureSpec {
    name: string;
    description: string; // one line, for the Build menu
    cost: number; // materials
    health: number;
    points: number; // added to the owner's score while it stands
    hexes: 3 | 7; // footprint size: 7 = a hex and its 6 neighbors, 3 = a clump that all touch
}

// Tile limit: a player may hold this many hexes at once, plus TILES_PER_FARM for every farm they
// own. At the limit, walking over hexes that aren't yours claims nothing.
export const BASE_TILE_CAP = 500;
export const TILES_PER_FARM = 500;

/** How many hexes a player with `farms` farms may hold. */
export function tileCapFor(farms: number): number {
    return BASE_TILE_CAP + farms * TILES_PER_FARM;
}

export const STRUCTURE_HEALTH = 1000; // every structure but the Guard Tower
export const STRUCTURE_COST = 100;

export const STRUCTURE_SPECS: Record<StructureType, StructureSpec> = {
    farm: {
        name: 'Farm',
        description: `Raises your tile limit by ${TILES_PER_FARM}. Needs 7 hexes of your own.`,
        cost: STRUCTURE_COST,
        health: STRUCTURE_HEALTH,
        points: 100,
        hexes: 7,
    },
    fabricator: {
        name: 'Fabricator',
        description:
            'Unlocks the Fabricator for guns, ammo and upgrades. Needs 7 hexes of your own.',
        cost: STRUCTURE_COST,
        health: STRUCTURE_HEALTH,
        points: 100,
        hexes: 7,
    },
    guardTower: {
        name: 'Guard Tower',
        description:
            'Shoots enemies nearby with a Blaster and unlimited ammo. Needs 3 touching hexes of your own.',
        cost: STRUCTURE_COST,
        health: 500,
        points: 50,
        hexes: 3,
    },
    power: {
        name: 'Power plant',
        description: 'Essential (more to come). Needs 7 hexes of your own.',
        cost: STRUCTURE_COST,
        health: STRUCTURE_HEALTH,
        points: 100,
        hexes: 7,
    },
};

export const STRUCTURE_TYPES = Object.keys(STRUCTURE_SPECS) as StructureType[];

export const STRUCTURE_NAMES = Object.fromEntries(
    STRUCTURE_TYPES.map((type) => [type, STRUCTURE_SPECS[type].name])
) as Record<StructureType, string>;

// Three characters are good at the structure they start with: one of that type they own scores
// 150 instead of 100 (the Farmer's farms from the start; the Engineer's fabricators and the
// Scientist's power plants since 2026-10-03).
export const SPECIALIST_STRUCTURE_POINTS = 150;
export const SPECIALTIES: Partial<Record<string, StructureType>> = {
    farmer: 'farm',
    engineer: 'fabricator',
    scientist: 'power',
};

/** What a structure of `type` adds to the score of an owner playing `character`. */
export function structurePoints(type: StructureType, character: string): number {
    if (SPECIALTIES[character] === type) return SPECIALIST_STRUCTURE_POINTS;
    return STRUCTURE_SPECS[type].points;
}

/** The fields a structure's footprint depends on (a synced `StructureState` has them). */
export interface PlacedStructure {
    type: string;
    tileX: number;
    tileY: number;
    rotation: number;
}

function footprintSpecOf(structure: PlacedStructure, hexes?: 3 | 7) {
    return {
        hexes:
            hexes ?? (isStructureType(structure.type) ? STRUCTURE_SPECS[structure.type].hexes : 7),
        tileX: structure.tileX,
        tileY: structure.tileY,
        rotation: structure.rotation,
    };
}

/** The hexes a placed structure occupies. */
export function structureHexes(structure: PlacedStructure): HexCoord[] {
    return footprintHexes(footprintSpecOf(structure));
}

/** True if hex (col, row) is under a placed structure. */
export function inStructure(col: number, row: number, structure: PlacedStructure): boolean {
    return inFootprint(col, row, footprintSpecOf(structure));
}

/** The hexes a structure of `type` would occupy if placed at (col, row) turned `rotation`. */
export function footprintFor(
    type: StructureType,
    col: number,
    row: number,
    rotation = 0
): HexCoord[] {
    return structureHexes({ type, tileX: col, tileY: row, rotation });
}

// The gun ids stay `basic` and `big` in code; players know them as the Blaster and the Ion Cannon
// (renamed 2026-10-03).
export const GUN_NAMES: Record<GunId, string> = { basic: 'Blaster', big: 'Ion Cannon' };

// Damage per hit. Players have 100 health, +100 per Armor level. The Blaster did 50 until
// 2026-10-03, when it halved; the Ion Cannon (100) was cut to double the Blaster.
export const GUN_DAMAGE: Record<GunId, number> = { basic: 25, big: 50 };

// The least time between shots, in ms. The Blaster is 1 a second (2026-10-03, a first guess: it was
// 5 a second) and the Ion Cannon twice as fast (it was 5 a second). The Guard Tower fires the
// Blaster, so it uses the Blaster's. People's clients keep to it (GameScene.tryShoot) and bots never
// fire faster. 📝 The server doesn't enforce it for people yet.
export const GUN_FIRE_INTERVAL_MS: Record<GunId, number> = { basic: 1000, big: 500 };

// How long a shot flies, in ms. Shots move 600 on-screen px/s, so this is the range: the Blaster's
// 2 s is 1,200 px and the Ion Cannon's 4 s is 2,400 px (twice the Blaster's, 2026-10-03).
export const GUN_SHOT_LIFETIME_MS: Record<GunId, number> = { basic: 2000, big: 4000 };

export function isGunId(value: unknown): value is GunId {
    return typeof value === 'string' && Object.hasOwn(GUN_NAMES, value);
}

// --- Upgrades ----------------------------------------------------------------------------------
// Bought in the shop a level at a time. A player has one upgrade *slot*: of the slot upgrades
// (Booster, Harvester, Jetpack) only the equipped one has an effect, and switching has a cooldown.
// Armor isn't a slot upgrade: it always works once bought. See docs/GAME_DESIGN.md → Upgrades.
export interface UpgradeInfo {
    id: UpgradeId;
    name: string;
    maxLevel: number;
    slot: boolean; // true = only works while equipped
    cost: number; // materials per level
}

export const UPGRADES: Record<UpgradeId, UpgradeInfo> = {
    booster: { id: 'booster', name: 'Booster', maxLevel: 3, slot: true, cost: 100 },
    // Called the Harvester until 2026-10-03; the id stays `expander` in code.
    expander: { id: 'expander', name: 'Harvester', maxLevel: 3, slot: true, cost: 100 },
    armor: { id: 'armor', name: 'Armor', maxLevel: 3, slot: false, cost: 100 },
    // Called the Jetpack until 2026-10-03 (id `wings`); it also gives Booster 1's speed, so it costs 200.
    wings: { id: 'wings', name: 'Jetpack', maxLevel: 1, slot: true, cost: 200 },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export const UPGRADE_NAMES = Object.fromEntries(
    UPGRADE_IDS.map((id) => [id, UPGRADES[id].name])
) as Record<UpgradeId, string>;

export function isUpgradeId(value: unknown): value is UpgradeId {
    return typeof value === 'string' && Object.hasOwn(UPGRADES, value);
}

export const BOOSTER_SPEED_PER_LEVEL = 0.33; // +33% of base top speed per level: 133/166/199%
export const JETPACK_SPEED_BONUS = BOOSTER_SPEED_PER_LEVEL; // the Jetpack also gives Booster 1's +33%
export const EXPANDER_SLOW_PER_LEVEL = 0.1; // the Harvester costs 10% of base top speed per level: 90/80/70%
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

/** "Booster 2" (or just "Jetpack" for a single-level upgrade). */
export function upgradeLabel(id: UpgradeId, level: number): string {
    return UPGRADES[id].maxLevel > 1 ? `${UPGRADES[id].name} ${level}` : UPGRADES[id].name;
}

/** What `id` does at `level`. */
export function upgradeEffect(id: UpgradeId, level: number): string {
    switch (id) {
        case 'booster':
            return `${Math.round(100 + level * BOOSTER_SPEED_PER_LEVEL * 100)}% of normal speed.`;
        case 'expander':
            return `Claim ${EXPANDER_HEXES[level - 1]} hexes at once, standing mid-hex. ${Math.round(100 - level * EXPANDER_SLOW_PER_LEVEL * 100)}% of normal speed.`;
        case 'armor':
            return `${100 + level * ARMOR_HEALTH_PER_LEVEL} max health. Always on, no slot needed.`;
        case 'wings':
            return `Walk over mountains and deep water, and ${Math.round(100 + JETPACK_SPEED_BONUS * 100)}% of normal speed (like Booster 1). You still can't claim terrain.`;
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
    engineer: {
        id: 'engineer',
        name: 'Engineer',
        description: 'Starts with a fabricator.',
        gun: null,
        ammo: 0,
        structures: ['fabricator'],
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
        description: 'Starts with Armor (200 health), but few materials.',
        gun: null,
        ammo: 0,
        structures: [],
        materials: 15,
        upgrades: { armor: 1 },
    },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(value: unknown): value is CharacterId {
    return typeof value === 'string' && Object.hasOwn(CHARACTERS, value);
}

export function isStructureType(value: unknown): value is StructureType {
    return typeof value === 'string' && Object.hasOwn(STRUCTURE_SPECS, value);
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
    | 'guardTower'
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
export const AMMO_MATERIALS_PER_SHOT = 2; // 1 until 2026-09-29, when weapons doubled in price

// One shop entry per upgrade; it always offers your next level (see shopItemTitle).
const upgradeItem = (id: UpgradeId): ShopItem => ({
    id,
    category: 'upgrades',
    name: UPGRADES[id].name,
    description: upgradeEffect(id, 1),
    cost: UPGRADES[id].cost,
    upgrade: id,
});

const structureItem = (id: StructureType): ShopItem => ({
    id,
    category: 'structures',
    name: STRUCTURE_SPECS[id].name,
    description: STRUCTURE_SPECS[id].description,
    cost: STRUCTURE_SPECS[id].cost,
    structure: id,
});

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
    basicGun: {
        id: 'basicGun',
        category: 'weapons',
        name: GUN_NAMES.basic,
        description: `Lets you shoot (you still need ammo). ${GUN_DAMAGE.basic} damage per hit.`,
        cost: 200, // weapons doubled in price 2026-09-29 (Basic 100, Big 200, ammo 1 a shot before)
        gun: 'basic',
    },
    bigGun: {
        id: 'bigGun',
        category: 'weapons',
        name: GUN_NAMES.big,
        description: `Twice the Blaster: ${GUN_DAMAGE.big} damage, 2 shots a second, double the range. Replaces the Blaster.`,
        cost: 400,
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
    guardTower: structureItem('guardTower'),
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
 * gun that isn't better than theirs (the blaster once you have any gun, the ion cannon once you
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
// refused during the cooldown, and refused for leaving the Jetpack while over a mountain or deep water).
export interface EquipUpgradeMessage {
    upgradeId: UpgradeId | '';
}

// --- Terrain -----------------------------------------------------------------------------------
// Each hex's terrain, synced once as a byte per tile (Tile.terrain). The server generates a new
// layout for every match (server/src/terrain.ts); see docs/GAME_DESIGN.md → Terrain for the rules.
export const TERRAIN = { ground: 0, mountain: 1, water: 2 } as const;
export type Terrain = (typeof TERRAIN)[keyof typeof TERRAIN];

// The terrain's color scheme, picked at random for each match by the server (GameState.theme) so
// everyone in it sees the same map. The client's palettes are in client/src/game/terrainPalettes.ts.
export type TerrainThemeId = 'slate' | 'titan';
export const TERRAIN_THEME_IDS: TerrainThemeId[] = ['slate', 'titan'];

export function isTerrainThemeId(value: unknown): value is TerrainThemeId {
    return typeof value === 'string' && (TERRAIN_THEME_IDS as string[]).includes(value);
}

// --- Pickups -----------------------------------------------------------------------------------
// Identical drop pods lying on the map, placed when the room is created (server/src/pickups.ts)
// when the PICKUPS_ENABLED feature flag is on. Walk onto one's hex to open it (see PickupSystem):
// its contents are rolled then, for your score tier, and only then sent to clients. A pile of
// materials or ammo has an `amount`; an item gives what its Fabricator item gives, for free.
export type PickupKind = 'materials' | 'ammo' | 'item';

// Server -> Client, to the owner only: they walked onto one of their backpacks and got its contents
// back ("Ion Cannon, 12 ammo, Booster 2"). Backpacks themselves are synced to their owner only
// (GameState.backpacks); see docs/GAME_DESIGN.md → Players.
export interface BackpackCollectedEvent {
    contents: string;
}

// Server -> Client, to the player only: they walked over ground they could have claimed but are at
// their tile limit (`limit` hexes: 500 plus 500 per farm), so it wasn't claimed. Sent again, at most
// every few seconds, while they keep trying. The client tells them to build more farms.
export interface TileLimitReachedEvent {
    limit: number;
}

// Server -> Client: a player opened a drop pod, and what was inside (it has gone from `state.pickups`).
export interface PickupCollectedEvent {
    playerId: string;
    kind: PickupKind;
    itemId: ShopItemId | ''; // for kind 'item'
    amount: number; // for 'materials' and 'ammo'
}

/** What a pickup is, in words: "30 materials", "12 ammo", "Booster 1", "Blaster", "Farm". */
export function pickupLabel(kind: PickupKind, itemId: string, amount: number): string {
    if (kind === 'materials') return `${amount} materials`;
    if (kind === 'ammo') return `${amount} ammo`;
    if (!isShopItemId(itemId)) return 'an item';
    const item = SHOP_ITEMS[itemId];
    return item.upgrade ? upgradeLabel(item.upgrade, 1) : item.name;
}
