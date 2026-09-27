// Pickups for a match: items scattered across the map when the room is created, behind the
// PICKUPS_ENABLED feature flag. The rules are in docs/GAME_DESIGN.md → Pickups; the numbers are in
// constants.ts. Collecting them is PickupSystem's job.

import {
    PICKUP_AMMO,
    PICKUP_CHANCES,
    PICKUP_MATERIALS,
    PICKUP_GRID,
    PICKUP_JITTER,
    SPAWN_CLEAR_RADIUS,
} from './constants';
import { hexDistance, hexIndex, hexNeighbors, isValidHex, type HexCoord } from './hex';
import { spawnHexes } from './terrain';
import {
    TERRAIN,
    UPGRADE_IDS,
    type PickupKind,
    type ShopItemId,
    type StructureType,
    type Terrain,
} from './types/shared';

export interface PickupSpec {
    kind: PickupKind;
    itemId: ShopItemId | '';
    amount: number;
    col: number;
    row: number;
}

const STRUCTURE_ITEMS: StructureType[] = ['farm', 'fabricator', 'fort', 'power'];

/**
 * One roll of PICKUP_CHANCES: what a location gets, or null for nothing. `random` returns [0, 1).
 */
export function rollPickup(random: () => number): Omit<PickupSpec, 'col' | 'row'> | null {
    const total = Object.values(PICKUP_CHANCES).reduce((sum, weight) => sum + weight, 0);
    let roll = random() * total;
    let outcome: keyof typeof PICKUP_CHANCES = 'nothing';
    for (const [key, weight] of Object.entries(PICKUP_CHANCES)) {
        if (roll < weight) {
            outcome = key as keyof typeof PICKUP_CHANCES;
            break;
        }
        roll -= weight;
    }
    const between = (range: { min: number; max: number }) =>
        range.min + Math.floor(random() * (range.max - range.min + 1));
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

    switch (outcome) {
        case 'materials':
            return { kind: 'materials', itemId: '', amount: between(PICKUP_MATERIALS) };
        case 'ammo':
            return { kind: 'ammo', itemId: '', amount: between(PICKUP_AMMO) };
        case 'upgrade':
            return { kind: 'item', itemId: pick(UPGRADE_IDS), amount: 0 };
        case 'basicGun':
        case 'bigGun':
            return { kind: 'item', itemId: outcome, amount: 0 };
        case 'structure':
            return { kind: 'item', itemId: pick(STRUCTURE_ITEMS), amount: 0 };
        default:
            return null;
    }
}

/**
 * Places up to PICKUP_GRID.cols x PICKUP_GRID.rows pickups: one per grid cell, at the cell's center
 * nudged by up to PICKUP_JITTER hexes, then moved to the nearest hex that's ground, outside every
 * spawn area, and not already holding a pickup. A location that rolls "nothing" stays empty.
 */
export function generatePickups(
    terrain: readonly Terrain[],
    cols: number,
    rows: number,
    random: () => number = Math.random
): PickupSpec[] {
    const spawns = spawnHexes(cols, rows);
    const taken = new Set<number>();
    const jitter = () => Math.floor(random() * (PICKUP_JITTER * 2 + 1)) - PICKUP_JITTER;
    const fits = (h: HexCoord) =>
        terrain[hexIndex(h.col, h.row, cols)] === TERRAIN.ground &&
        !taken.has(hexIndex(h.col, h.row, cols)) &&
        spawns.every((spawn) => hexDistance(h, spawn) > SPAWN_CLEAR_RADIUS);

    const pickups: PickupSpec[] = [];
    for (let gy = 0; gy < PICKUP_GRID.rows; gy++) {
        for (let gx = 0; gx < PICKUP_GRID.cols; gx++) {
            const clamp = (value: number, max: number) => Math.min(max - 1, Math.max(0, value));
            const start = {
                col: clamp(Math.floor(((gx + 0.5) * cols) / PICKUP_GRID.cols) + jitter(), cols),
                row: clamp(Math.floor(((gy + 0.5) * rows) / PICKUP_GRID.rows) + jitter(), rows),
            };
            const at = nearest(start, cols, rows, fits);
            const item = rollPickup(random);
            if (!at || !item) continue;
            taken.add(hexIndex(at.col, at.row, cols));
            pickups.push({ ...item, col: at.col, row: at.row });
        }
    }
    return pickups;
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
