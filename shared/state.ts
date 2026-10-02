// The shape of the synced room state, as plain interfaces.
//
// The server's schema classes (server/src/state/GameState.ts) `implement` these, so the compiler
// flags any field the server drops or retypes that the client relies on. The client uses them to
// type `room.state`: colyseus.js decodes @colyseus/schema state by reflection at connect time and
// never imports the server's schema classes, and the decoded MapSchema/ArraySchema instances
// satisfy `ReadonlyMap` / `readonly T[]` structurally, so a straight cast is safe.
// (A field the server adds but these don't list isn't flagged — add it here when the client needs it.)

import type { GamePhase, MapSizeId, Terrain } from './types';

export interface PlayerState {
    id: string;
    name: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    health: number;
    maxHealth: number; // 200 with the Armor upgrade
    ammo: number;
    tilesOwned: number;
    kills: number;
    score: number; // computed server-side: tiles + kills x 50 + structures (materials excluded)
    materials: number;
    claimRadius: number; // world px; above the base radius means the Expander is owned
    connected: boolean;
    color: string; // the team's color
    teamId: string; // a TeamId; same team = allies
    character: string; // a CharacterId, picked in the lobby
    ready: boolean; // lobby only
    gun: string; // a GunId, or '' = unarmed
    structureInventory: readonly string[]; // StructureTypes left to place
    boosterLevel: number; // upgrade levels, 0 = not owned (see UPGRADES in types.ts)
    expanderLevel: number;
    armorLevel: number;
    wingsLevel: number;
    equippedUpgrade: string; // the slot upgrade in effect: an UpgradeId, or '' for none
    spawnTileX: number; // the hex they start and respawn on (col, row): drawn as a spawn platform
    spawnTileY: number;
    bot: boolean; // computer-controlled (see BotSystem on the server); always ready
    botDifficulty: string; // a BotDifficulty for a bot, '' for a person
    respawnAt: number; // defeated, respawning at this server time (ms); 0 = alive
}

export interface TileState {
    ownerId: string; // empty string = unclaimed
    terrain: Terrain; // TERRAIN.ground / mountain / water; fixed for the match
}

export interface ProjectileState {
    id: string;
    ownerId: string;
    x: number;
    y: number;
    angle: number;
    speed: number;
    spawnedAt: number;
    damage: number; // from the shooter's gun
}

export interface StructureState {
    id: string;
    ownerId: string;
    tileX: number;
    tileY: number;
    type: string; // a StructureType
    health: number;
    maxHealth: number;
}

export interface PickupState {
    id: string;
    tileX: number; // the hex it lies on (col, row)
    tileY: number;
}

// One mountain, for drawing its sprite: 3 hexes that all touch (small) or a hex and its 6 neighbors
// (large). A mountain range is one or more of these side by side. `hexes` are tile indices
// (row * mapWidth + col); every mountain hex belongs to exactly one piece. Fixed for the match.
export interface MountainPieceState {
    size: number; // 3 or 7 (the number of hexes)
    hexes: readonly number[];
}

// Weapons and upgrades a player dropped where they were defeated. The server only sends a player
// their own backpacks; what's inside isn't synced.
export interface BackpackState {
    id: string;
    ownerId: string;
    tileX: number; // the hex it lies on (col, row)
    tileY: number;
}

// The game's settings, fixed when it's created (see GameSettings in types.ts).
export interface GameSettingsState {
    name: string;
    mapSize: MapSizeId | string;
    teams: boolean;
    pods: boolean;
    matchMinutes: number;
}

export interface GamePhaseStateShape {
    phase: GamePhase;
    endsAt: number;
}

export interface GameStateShape {
    players: ReadonlyMap<string, PlayerState>;
    structures: ReadonlyMap<string, StructureState>;
    projectiles: ReadonlyMap<string, ProjectileState>;
    pickups: ReadonlyMap<string, PickupState>; // empty when the PICKUPS_ENABLED flag is off
    backpacks: ReadonlyMap<string, BackpackState>; // only your own
    tiles: readonly TileState[];
    mountains: readonly MountainPieceState[]; // how the mountain hexes group into mountains
    theme: string; // a TerrainThemeId: the match's color scheme, fixed for the match
    phase: GamePhaseStateShape;
    settings: GameSettingsState;
    mapWidth: number;
    mapHeight: number;
}
