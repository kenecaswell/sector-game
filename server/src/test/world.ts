// Test builders for server specs: a fresh 64 x 64 world and helpers to put things in it.
import { GameState, Player, Projectile, Structure, Tile } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { SCREEN_Y_SCALE, TICK_RATE } from '../constants';
import { hexCenter } from '../hex';
import {
    STRUCTURE_SPECS,
    footprintFor,
    type GamePhase,
    type StructureType,
    type Terrain,
} from '../types/shared';

export const DT = 1 / TICK_RATE; // one server tick, in seconds
export const MAP_SIZE = 64;

/**
 * A 64 x 64 map with every tile unclaimed, in the given phase. Pass `{ tiles: false }` to skip
 * creating the 4,096 tiles when only movement or combat is under test (they never read tiles) —
 * it keeps loops that build hundreds of worlds fast. Guns are on (`guns: false` for a game where
 * a game created without the guns setting, the real default).
 */
export function world(
    phase: GamePhase = 'playing',
    { tiles = true, teams = true, guns = true } = {}
): GameState {
    const state = new GameState();
    state.settings.teams = teams; // most specs exercise teammates; games default to teams off
    state.settings.guns = guns; // most specs exercise guns; games default to guns off
    state.mapWidth = MAP_SIZE;
    state.mapHeight = MAP_SIZE;
    state.phase.phase = phase;
    if (tiles) for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) state.tiles.push(new Tile());
    return state;
}

export function addPlayer(state: GameState, id: string, x = 1500, y = 1500, teamId = ''): Player {
    const player = new Player();
    player.id = id;
    player.teamId = teamId;
    player.x = x;
    player.y = y;
    state.players.set(id, player);
    return player;
}

/** A player standing on the center of hex (col, row) (optionally nudged by dx, dy). */
export function addPlayerAt(
    state: GameState,
    id: string,
    col: number,
    row: number,
    teamId = '',
    dx = 0,
    dy = 0
): Player {
    const c = hexCenter(col, row);
    return addPlayer(state, id, c.x + dx, c.y + dy, teamId);
}

/** Puts a structure in the world as if placed (a farm unless `type` says otherwise). */
export function addStructure(
    state: GameState,
    ownerId: string,
    col: number,
    row: number,
    type: StructureType = 'farm',
    rotation = 0
): Structure {
    const structure = new Structure();
    structure.id = `s-${col}-${row}`;
    structure.ownerId = ownerId;
    structure.tileX = col;
    structure.tileY = row;
    structure.type = type;
    structure.rotation = rotation;
    structure.health = STRUCTURE_SPECS[type].health;
    structure.maxHealth = STRUCTURE_SPECS[type].health;
    state.structures.set(structure.id, structure);
    return structure;
}

/** Gives `ownerId` every hex of the footprint of a `type` structure at (col, row). */
export function ownFootprint(
    state: GameState,
    ownerId: string,
    col: number,
    row: number,
    type: StructureType = 'farm',
    rotation = 0
): void {
    for (const hex of footprintFor(type, col, row, rotation)) {
        state.tiles[hex.row * state.mapWidth + hex.col].ownerId = ownerId;
    }
}

/** Sets the terrain of the given hexes (the rest stay ground). */
export function setTerrain(
    state: GameState,
    terrain: Terrain,
    hexes: Array<[number, number]>
): void {
    for (const [col, row] of hexes) state.tiles[row * state.mapWidth + col].terrain = terrain;
}

export function tileAt(state: GameState, col: number, row: number): Tile {
    return state.tiles[row * state.mapWidth + col];
}

/** A shot from `ownerId` at (x, y), heading `angle`. */
export function addShot(
    state: GameState,
    ownerId: string,
    x: number,
    y: number,
    angle = 0,
    damage?: number
): Projectile {
    const shot = new Projectile();
    shot.id = `p${state.projectiles.size}-${Math.random()}`;
    shot.ownerId = ownerId;
    shot.x = x;
    shot.y = y;
    shot.angle = angle;
    shot.spawnedAt = Date.now();
    if (damage !== undefined) shot.damage = damage;
    state.projectiles.set(shot.id, shot);
    return shot;
}

/** Fires a shot from just beside `target` straight into them and runs one combat tick. */
export function shootAt(
    state: GameState,
    ownerId: string,
    target: { x: number; y: number },
    damage?: number
): Projectile {
    const shot = addShot(state, ownerId, target.x - 1, target.y, 0, damage);
    CombatSystem.update(state, DT, () => {});
    return shot;
}

/** The input map MovementSystem reads, holding one fresh input per player. */
export function inputs(
    entries: Record<string, { x: number; y: number }>
): Map<string, PlayerInput> {
    return new Map(
        Object.entries(entries).map(([id, dir]) => [id, { dir, seq: 1, receivedAt: Date.now() }])
    );
}

/** Runs `ticks` movement ticks (keeping the inputs fresh). */
export function runMovement(
    state: GameState,
    input: Map<string, PlayerInput>,
    ticks: number
): void {
    for (let i = 0; i < ticks; i++) {
        input.forEach((entry) => (entry.receivedAt = Date.now()));
        MovementSystem.update(state, input, DT);
    }
}

/** A lone player at (start) holding `dir` for `ticks` ticks. */
export function drive(
    dir: { x: number; y: number },
    ticks: number,
    { phase = 'playing' as GamePhase, start = [1500, 1500] as [number, number] } = {}
): Player {
    const state = world(phase);
    const player = addPlayer(state, 'a', ...start);
    runMovement(state, inputs({ a: dir }), ticks);
    return player;
}

/** Speed as seen on screen (y squashed by the view tilt), which is what the speed rules use. */
export const onScreenSpeed = (player: { vx: number; vy: number }): number =>
    Math.hypot(player.vx, player.vy * SCREEN_Y_SCALE);
