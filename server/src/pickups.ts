// Pickups for a match: identical drop pods scattered across the map when the room is created, behind the
// PICKUPS_ENABLED feature flag. The rules are in docs/GAME_DESIGN.md → Pickups; the numbers are in
// constants.ts. Collecting them is PickupSystem's job.

import {
    PICKUP_AMMO,
    PICKUP_EMPTY_CHANCE,
    PICKUP_GRID,
    PICKUP_JITTER,
    PICKUP_MATERIALS,
    PICKUP_TIER_CHANCES,
    SPAWN_CLEAR_RADIUS,
    type PickupOutcome,
} from './constants';
import { hexDistance, hexIndex, hexNeighbors, isValidHex, type HexCoord } from './hex';
import { spawnHexes } from './terrain';
import {
    TERRAIN,
    UPGRADE_IDS,
    upgradeLevel,
    type PickupKind,
    type ShopItemId,
    type StructureType,
    type Terrain,
    type UpgradeHolder,
} from './types/shared';

/** What's inside a drop pod, decided when it's collected. */
export interface PickupContents {
    kind: PickupKind;
    itemId: ShopItemId | '';
    amount: number; // materials or shots, for 'materials' and 'ammo'
}

/** The parts of a player the roll looks at: their gun and upgrade levels. */
export type PickupCollector = UpgradeHolder & { gun: string };

const STRUCTURE_ITEMS: StructureType[] = ['farm', 'fabricator', 'fort', 'power'];

/**
 * A player's score tier, 0 (the leader) to PICKUP_TIER_CHANCES.length - 1 (at the back), from
 * everyone's current scores. Players are ranked by score; tied players share the average of their
 * places, so when everyone is level (the start of a match) they all land in the middle, not at the
 * top. One player alone is the leader.
 */
export function scoreTier(scores: readonly number[], score: number): number {
    const last = PICKUP_TIER_CHANCES.length - 1;
    if (scores.length <= 1) return 0;
    const ahead = scores.filter((s) => s > score).length;
    const level = scores.filter((s) => s === score).length;
    const place = ahead + (Math.max(level, 1) - 1) / 2; // 0 = first, scores.length - 1 = last
    return Math.round((place * last) / (scores.length - 1));
}

/** Which outcomes this collector could use; the others are left out of the roll. */
function usable(outcome: PickupOutcome, collector: PickupCollector): boolean {
    switch (outcome) {
        case 'upgrade':
            return UPGRADE_IDS.some((id) => upgradeLevel(collector, id) === 0);
        case 'basicGun':
            return collector.gun === ''; // no downgrades, like the Fabricator
        case 'bigGun':
            return collector.gun !== 'big';
        default:
            return true; // materials, ammo, structures
    }
}

/**
 * Rolls a drop pod's contents for `collector` in score `tier`, from that tier's row of
 * PICKUP_TIER_CHANCES. Outcomes they couldn't use are dropped and the rest share the chance, so a
 * pod always holds something useful. An upgrade is level 1 of one they don't have yet; a structure
 * is a random type. `random` returns [0, 1).
 */
export function rollPickup(
    tier: number,
    collector: PickupCollector,
    random: () => number = Math.random
): PickupContents {
    const row = PICKUP_TIER_CHANCES[Math.min(Math.max(tier, 0), PICKUP_TIER_CHANCES.length - 1)];
    const options = (Object.entries(row) as [PickupOutcome, number][]).filter(
        ([outcome, weight]) => weight > 0 && usable(outcome, collector)
    );
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = random() * total;
    let outcome: PickupOutcome = 'materials';
    for (const [key, weight] of options) {
        if (roll < weight) {
            outcome = key;
            break;
        }
        roll -= weight;
    }
    const between = (range: { min: number; max: number }) =>
        range.min + Math.floor(random() * (range.max - range.min + 1));
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

    switch (outcome) {
        case 'ammo':
            return { kind: 'ammo', itemId: '', amount: between(PICKUP_AMMO) };
        case 'upgrade': {
            const missing = UPGRADE_IDS.filter((id) => upgradeLevel(collector, id) === 0);
            return { kind: 'item', itemId: pick(missing), amount: 0 };
        }
        case 'basicGun':
        case 'bigGun':
            return { kind: 'item', itemId: outcome, amount: 0 };
        case 'structure':
            return { kind: 'item', itemId: pick(STRUCTURE_ITEMS), amount: 0 };
        default:
            return { kind: 'materials', itemId: '', amount: between(PICKUP_MATERIALS) };
    }
}

/** A pod's place: its hex and which PICKUP_GRID cell (row-major) it belongs to. */
export interface PodSpot extends HexCoord {
    cell: number;
}

export interface PodPlacementOptions {
    /** Which grid cells to fill (default: all of them). */
    cells?: readonly number[];
    /** Hexes a pod can't go on, besides terrain and spawn areas (e.g. existing pods, structures). */
    blocked?: (h: HexCoord) => boolean;
}

/**
 * Places drop pods, one per grid cell (PICKUP_GRID.cols x PICKUP_GRID.rows): at the cell's center
 * nudged by up to PICKUP_JITTER hexes, then moved to the nearest hex that's ground, outside every
 * spawn area, not `blocked`, and not already holding one. Each cell has a PICKUP_EMPTY_CHANCE %
 * chance of getting no pod. Used at the start of a match (all cells) and by respawn waves (the
 * empty cells). Only positions: contents are rolled on opening.
 */
export function generatePickups(
    terrain: readonly Terrain[],
    cols: number,
    rows: number,
    random: () => number = Math.random,
    { cells, blocked = () => false }: PodPlacementOptions = {}
): PodSpot[] {
    const spawns = spawnHexes(cols, rows);
    const taken = new Set<number>();
    const jitter = () => Math.floor(random() * (PICKUP_JITTER * 2 + 1)) - PICKUP_JITTER;
    const fits = (h: HexCoord) =>
        terrain[hexIndex(h.col, h.row, cols)] === TERRAIN.ground &&
        !taken.has(hexIndex(h.col, h.row, cols)) &&
        !blocked(h) &&
        spawns.every((spawn) => hexDistance(h, spawn) > SPAWN_CLEAR_RADIUS);

    const all = Array.from({ length: PICKUP_GRID.cols * PICKUP_GRID.rows }, (_, cell) => cell);
    const pods: PodSpot[] = [];
    for (const cell of cells ?? all) {
        const gx = cell % PICKUP_GRID.cols;
        const gy = Math.floor(cell / PICKUP_GRID.cols);
        const clamp = (value: number, max: number) => Math.min(max - 1, Math.max(0, value));
        const start = {
            col: clamp(Math.floor(((gx + 0.5) * cols) / PICKUP_GRID.cols) + jitter(), cols),
            row: clamp(Math.floor(((gy + 0.5) * rows) / PICKUP_GRID.rows) + jitter(), rows),
        };
        if (random() * 100 < PICKUP_EMPTY_CHANCE) continue; // no pod here this time
        const at = nearest(start, cols, rows, fits);
        if (!at) continue;
        taken.add(hexIndex(at.col, at.row, cols));
        pods.push({ ...at, cell });
    }
    return pods;
}

/** The closest hex to `start` (by hex steps, breadth first) that `fits`, or null if none does. */
function nearest(
    start: HexCoord,
    cols: number,
    rows: number,
    fits: (h: HexCoord) => boolean
): HexCoord | null {
    const seen = new Set([hexIndex(start.col, start.row, cols)]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
        const h = queue[head];
        if (fits(h)) return h;
        for (const n of hexNeighbors(h.col, h.row)) {
            const i = hexIndex(n.col, n.row, cols);
            if (!isValidHex(n.col, n.row, cols, rows) || seen.has(i)) continue;
            seen.add(i);
            queue.push(n);
        }
    }
    return null;
}
