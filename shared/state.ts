// The shape of the synced room state, as plain interfaces.
//
// The server's schema classes (server/src/state/GameState.ts) `implement` these, so the compiler
// flags any field the server drops or retypes that the client relies on. The client uses them to
// type `room.state`: colyseus.js decodes @colyseus/schema state by reflection at connect time and
// never imports the server's schema classes, and the decoded MapSchema/ArraySchema instances
// satisfy `ReadonlyMap` / `readonly T[]` structurally, so a straight cast is safe.
// (A field the server adds but these don't list isn't flagged — add it here when the client needs it.)

import type { GamePhase } from './types';

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
    upgrades: readonly string[]; // UpgradeIds owned
}

export interface TileState {
    ownerId: string; // empty string = unclaimed
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

export interface GamePhaseStateShape {
    phase: GamePhase;
    endsAt: number;
}

export interface GameStateShape {
    players: ReadonlyMap<string, PlayerState>;
    structures: ReadonlyMap<string, StructureState>;
    projectiles: ReadonlyMap<string, ProjectileState>;
    tiles: readonly TileState[];
    phase: GamePhaseStateShape;
    mapWidth: number;
    mapHeight: number;
    nextPayoutAt: number;
}
