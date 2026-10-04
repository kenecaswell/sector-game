// Where bots go and how they get there: a breadth-first search over the hexes a bot can walk
// (around mountains, deep water and enemy structures), scored for what's worth claiming.

import type { GameState, Player } from '../state/GameState';
import {
    COMPACT_ROTATIONS,
    hexCenter,
    hexDistance,
    hexIndex,
    hexNeighbors,
    isValidHex,
    pixelToHex,
    type HexCoord,
} from '../hex';
import { blocksWalkingAt } from '../terrain';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { areAllies } from '../teams';
import { otherSpawnZones } from '../spawnZones';
import {
    STRUCTURE_SPECS,
    TERRAIN,
    footprintFor,
    inStructure,
    structureHexes,
    type StructureType,
} from '../types/shared';

// What each kind of hex is worth to a bot looking for somewhere to claim.
const VALUE_FRESH = 3; // never claimed this match: pays materials as well as a point
const VALUE_RECLAIM = 2; // unclaimed again (its owner left), or an enemy's
const VALUE_POD = 20; // a drop pod on it
const NEIGHBOR_WEIGHT = 0.3; // how much the hexes around a spot add to it (prefers open ground)
const HEADING_BONUS = 0.3; // spots ahead of it look this much better (fewer U-turns)

const walkableCache = new WeakMap<GameState, Uint8Array>();

/**
 * 1 for each hex a player on foot can walk on, 0 for mountains and deep water. Terrain is fixed for
 * the match, so it's worked out once per room.
 */
export function walkableGrid(state: GameState): Uint8Array {
    let grid = walkableCache.get(state);
    if (grid && grid.length === state.tiles.length) return grid;
    grid = new Uint8Array(state.tiles.length);
    for (let row = 0; row < state.mapHeight; row++) {
        for (let col = 0; col < state.mapWidth; col++) {
            grid[hexIndex(col, row, state.mapWidth)] = blocksWalkingAt(state, col, row) ? 0 : 1;
        }
    }
    walkableCache.set(state, grid);
    return grid;
}

/** The hex under a point, pulled onto the map for the few edge spots that are over no hex. */
export function hexOf(state: GameState, x: number, y: number): HexCoord {
    const { col, row } = pixelToHex(x, y);
    return {
        col: Math.max(0, Math.min(state.mapWidth - 1, col)),
        row: Math.max(0, Math.min(state.mapHeight - 1, row)),
    };
}

/** Hexes `playerId` can neither walk into nor claim: the footprints of enemies' structures. */
function enemyFootprints(state: GameState, playerId: string): Set<number> {
    const blocked = new Set<number>();
    state.structures.forEach((structure) => {
        if (areAllies(state, structure.ownerId, playerId)) return;
        for (const hex of structureHexes(structure)) {
            if (isValidHex(hex.col, hex.row, state.mapWidth, state.mapHeight)) {
                blocked.add(hexIndex(hex.col, hex.row, state.mapWidth));
            }
        }
    });
    return blocked;
}

interface Search {
    start: number;
    order: number[]; // hex indices in the order they were reached (nearest first)
    parent: Map<number, number>;
    depth: Map<number, number>;
    blocked: Set<number>; // hexes it can't walk into: enemy structures
    unclaimable: Set<number>; // hexes it can't claim: those, plus other players' spawn zones
}

/** Breadth-first search from the player's hex over the hexes they can walk to, up to `maxDepth` steps. */
function explore(state: GameState, player: Player, maxDepth: number): Search {
    const cols = state.mapWidth;
    const fly = UpgradeSystem.canFly(player);
    const walkable = walkableGrid(state);
    const blocked = enemyFootprints(state, player.id);
    const unclaimable = new Set([...blocked, ...otherSpawnZones(state, player.id)]);
    const from = hexOf(state, player.x, player.y);
    const start = hexIndex(from.col, from.row, cols);
    const parent = new Map([[start, -1]]);
    const depth = new Map([[start, 0]]);
    const order = [start];
    for (let q = 0; q < order.length; q++) {
        const i = order[q];
        const d = depth.get(i)!;
        if (d >= maxDepth) continue;
        for (const n of hexNeighbors(i % cols, Math.floor(i / cols))) {
            if (!isValidHex(n.col, n.row, cols, state.mapHeight)) continue;
            const j = hexIndex(n.col, n.row, cols);
            if (parent.has(j) || blocked.has(j) || (!fly && !walkable[j])) continue;
            parent.set(j, i);
            depth.set(j, d + 1);
            order.push(j);
        }
    }
    return { start, order, parent, depth, blocked, unclaimable };
}

/** The hexes to walk through from the search's start to hex `goal` (start left out, goal last). */
function routeFrom(search: Search, goal: number, cols: number): HexCoord[] {
    const route: HexCoord[] = [];
    for (let i = goal; i !== search.start && i !== -1; i = search.parent.get(i) ?? -1) {
        route.push({ col: i % cols, row: Math.floor(i / cols) });
    }
    return route.reverse();
}

/** What claiming hex `i` would be worth to `playerId` (0 = nothing: theirs, an ally's, terrain, or protected: under an enemy structure or in someone else's spawn zone). */
export function claimValue(
    state: GameState,
    i: number,
    playerId: string,
    blocked: ReadonlySet<number>
): number {
    const tile = state.tiles[i];
    if (!tile || tile.terrain !== TERRAIN.ground || blocked.has(i)) return 0;
    if (tile.ownerId === playerId) return 0;
    if (tile.ownerId === '') return tile.claimedBefore ? VALUE_RECLAIM : VALUE_FRESH;
    return areAllies(state, tile.ownerId, playerId) ? 0 : VALUE_RECLAIM;
}

export interface ClaimPlanOptions {
    depth: number; // how far to look (BotProfile.searchDepth)
    noise: number; // BotProfile.goalNoise
    random: () => number;
}

/**
 * Where a bot should go to claim next, as a route of hexes (empty if it's boxed in). Every hex it
 * can reach within `depth` steps is scored: what claiming it and (less) its neighbors is worth, a
 * drop pod on it, divided by how far it is, a little better if it's ahead of the bot, and shaken up
 * by `noise`. If nothing in reach is worth anything (it's deep in its own territory), it heads for
 * the nearest hex anywhere on the map that is and that it can walk to.
 */
export function planClaimRoute(
    state: GameState,
    player: Player,
    { depth, noise, random }: ClaimPlanOptions
): HexCoord[] {
    const cols = state.mapWidth;
    const search = explore(state, player, depth);
    const pods = new Set<number>();
    state.pickups.forEach((pod) => pods.add(hexIndex(pod.tileX, pod.tileY, cols)));
    const value = (i: number) => claimValue(state, i, player.id, search.unclaimable);
    const speed = Math.hypot(player.vx, player.vy);

    let best = -1;
    let bestScore = 0;
    for (const i of search.order) {
        if (i === search.start) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        let worth = value(i) + (pods.has(i) ? VALUE_POD : 0);
        if (worth === 0) continue;
        for (const n of hexNeighbors(col, row)) {
            if (isValidHex(n.col, n.row, cols, state.mapHeight)) {
                worth += NEIGHBOR_WEIGHT * value(hexIndex(n.col, n.row, cols));
            }
        }
        let score = worth / (search.depth.get(i)! + 1);
        if (speed > 1) {
            const c = hexCenter(col, row);
            const dx = c.x - player.x;
            const dy = c.y - player.y;
            const cos = (dx * player.vx + dy * player.vy) / (Math.hypot(dx, dy) * speed || 1);
            score *= 1 + HEADING_BONUS * cos;
        }
        score *= 1 + noise * random();
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    }
    if (best !== -1) return routeFrom(search, best, cols);

    // Nothing worth claiming in reach: head for the nearest hex it can walk to that is (searching
    // the whole map, so a wall between it and the nearest unclaimed ground is walked around).
    const everywhere = explore(state, player, Infinity);
    const target = everywhere.order.find((i) => i !== everywhere.start && value(i) > 0);
    return target === undefined ? [] : routeFrom(everywhere, target, cols);
}

/** The reached hex nearest (as the crow flies) to hex `target`: the goal itself if it was reached. */
function closestReached(search: Search, target: number, cols: number): number {
    if (search.parent.has(target)) return target;
    const goal = hexCenter(target % cols, Math.floor(target / cols));
    let best = search.start;
    let bestDistance = Infinity;
    for (const i of search.order) {
        const c = hexCenter(i % cols, Math.floor(i / cols));
        const distance = Math.hypot(c.x - goal.x, c.y - goal.y);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    }
    return best;
}

/** A route toward hex `goal`: all the way if it's within `depth` steps, else as close as that gets. */
export function planRouteToward(
    state: GameState,
    player: Player,
    goal: HexCoord,
    depth: number
): HexCoord[] {
    const cols = state.mapWidth;
    const search = explore(state, player, depth);
    return routeFrom(
        search,
        closestReached(search, hexIndex(goal.col, goal.row, cols), cols),
        cols
    );
}

export interface BuildSite {
    center: HexCoord; // the structure's center hex (7 hexes) or anchor hex (3)
    rotation: number; // how a 3-hex structure is turned (0 for the others)
    missing: HexCoord[]; // footprint hexes it still has to claim before it can place there
}

/**
 * The best spot within `radius` steps of the bot for a `type` structure: every footprint hex on the
 * map, ground, clear of every structure's footprint, and either the bot's already or claimable by it
 * (unclaimed or an enemy's; a teammate's is neither). Fewest hexes still to claim wins, then the
 * nearest. Null if there's no such spot. `maxMissing` caps how many hexes it may still have to
 * claim (0 when it can't claim any, at its tile limit).
 */
export function findBuildSite(
    state: GameState,
    player: Player,
    radius: number,
    type: StructureType,
    maxMissing = Infinity
): BuildSite | null {
    const cols = state.mapWidth;
    const here = hexOf(state, player.x, player.y);
    const rotations = STRUCTURE_SPECS[type].hexes === 3 ? COMPACT_ROTATIONS : 1;
    const spawnZones = otherSpawnZones(state, player.id);
    let best: BuildSite | null = null;
    let bestCost = Infinity;
    for (let row = here.row - radius - 1; row <= here.row + radius + 1; row++) {
        for (let col = here.col - radius; col <= here.col + radius; col++) {
            const center = { col, row };
            if (!isValidHex(col, row, cols, state.mapHeight)) continue;
            const distance = hexDistance(here, center);
            if (distance > radius) continue;
            for (let rotation = 0; rotation < rotations; rotation++) {
                const missing: HexCoord[] = [];
                let ok = true;
                for (const hex of footprintFor(type, col, row, rotation)) {
                    if (!isValidHex(hex.col, hex.row, cols, state.mapHeight)) {
                        ok = false;
                        break;
                    }
                    const tile = state.tiles[hexIndex(hex.col, hex.row, cols)];
                    if (
                        tile.terrain !== TERRAIN.ground ||
                        (tile.ownerId !== player.id &&
                            tile.ownerId !== '' &&
                            areAllies(state, tile.ownerId, player.id)) ||
                        Array.from(state.structures.values()).some((s) =>
                            inStructure(hex.col, hex.row, s)
                        )
                    ) {
                        ok = false;
                        break;
                    }
                    if (tile.ownerId !== player.id) {
                        // Someone else's spawn zone can't be claimed to complete the site.
                        if (spawnZones.has(hexIndex(hex.col, hex.row, cols))) {
                            ok = false;
                            break;
                        }
                        missing.push(hex);
                    }
                }
                if (!ok || missing.length > maxMissing) continue;
                const cost = missing.length * 3 + distance;
                if (cost < bestCost) {
                    bestCost = cost;
                    best = { center, rotation, missing };
                }
            }
        }
    }
    return best;
}
