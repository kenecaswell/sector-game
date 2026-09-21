// Structural typing for the decoded Colyseus room state.
//
// colyseus.js decodes @colyseus/schema state by reflection at connect time —
// the client never imports the server's schema classes (server/src/state/GameState.ts).
// These interfaces exist purely so TypeScript on the client knows the shape of
// `room.state`; the real decoded values (MapSchema/ArraySchema instances) satisfy
// `ReadonlyMap`/`readonly T[]` structurally at runtime, so a straight cast is safe.
// Keep this file in sync by hand with server/src/state/GameState.ts.

import type { GamePhase } from './shared';

export interface PlayerState {
    id: string;
    name: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    health: number;
    ammo: number;
    tilesOwned: number;
    kills: number;
    score: number; // computed server-side: tiles + kills x 50 + structures (credits excluded)
    credits: number;
    claimRadius: number; // world px; above the base radius means the Expander is owned
    connected: boolean;
    color: string;
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
}

export interface StructureState {
    id: string;
    ownerId: string;
    tileX: number;
    tileY: number;
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
