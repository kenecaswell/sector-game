// Terrain rules both sides need. See docs/GAME_DESIGN.md → Terrain.

import { hexNeighbors } from './hex';
import { TERRAIN, type Terrain } from './types';

/**
 * Whether the water hex at (col, row) is shallow enough to wade through: you could step straight
 * across it. That's when it has at most two water neighbors and those two don't touch each other —
 * lone water, and 1-wide stretches of river (bends included). Lakes and 2–4-wide stretches are deep.
 * `isWater` says whether a hex is water (false off the map).
 */
export function isShallowWater(
    isWater: (col: number, row: number) => boolean,
    col: number,
    row: number
): boolean {
    const wet: number[] = [];
    hexNeighbors(col, row).forEach((n, k) => {
        if (isWater(n.col, n.row)) wet.push(k);
    });
    if (wet.length <= 1) return true;
    if (wet.length > 2) return false;
    const apart = Math.abs(wet[0] - wet[1]);
    return apart !== 1 && apart !== 5; // neighbors k and k±1 touch each other
}

/**
 * Whether the hex at (col, row) stops a player on foot (without the Jetpack): a mountain, or deep water.
 * `terrainAt` gives a hex's terrain, or undefined off the map.
 */
export function blocksWalking(
    terrainAt: (col: number, row: number) => Terrain | undefined,
    col: number,
    row: number
): boolean {
    const terrain = terrainAt(col, row);
    if (terrain === TERRAIN.mountain) return true;
    if (terrain !== TERRAIN.water) return false;
    return !isShallowWater((c, r) => terrainAt(c, r) === TERRAIN.water, col, row);
}
