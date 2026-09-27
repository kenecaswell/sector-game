// The shape of the synced room state, as plain interfaces.
//
// The server's schema classes (server/src/state/GameState.ts) `implement` these, so the compiler
// flags any field the server drops or retypes that the client relies on. The client uses them to
// type `room.state`: colyseus.js decodes @colyseus/schema state by reflection at connect time and
// never imports the server's schema classes, and the decoded MapSchema/ArraySchema instances
// satisfy `ReadonlyMap` / `readonly T[]` structurally, so a straight cast is safe.
// (A field the server adds but these don't list isn't flagged — add it here when the client needs it.)

import type { GamePhase, Terrain } from './types';

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
    score: number; // computed server-side: tiles + kills x 50 + structures (credits excluded)
    credits: number;
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
    upgradeSwitchReadyAt: number; // server ms timestamp: when the equipped upgrade can next change
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
    kind: string; // a PickupKind: 'credits' | 'ammo' | 'item'
    itemId: string; // a ShopItemId for kind 'item' (a gun, a level-1 upgrade or a structure), else ''
    amount: number; // credits or shots, for 'credits' and 'ammo'
    tileX: number; // the hex it lies on (col, row)
    tileY: number;
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
    tiles: readonly TileState[];
    phase: GamePhaseStateShape;
    mapWidth: number;
    mapHeight: number;
}
