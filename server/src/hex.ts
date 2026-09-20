// Flat-top hex grid math, "odd-q" offset layout: odd columns are shoved down
// half a hex. Tiles live in a flat array indexed `row * cols + col`.
//
// Everything here is in the server's logical, top-down world space (pixels,
// y down). The client's isometric look is purely a render-time transform
// (see client/src/game/hex.ts, which is a hand-copy of this file plus the
// projection helpers) — the simulation never sees it.
//
// Reference: https://www.redblobgames.com/grids/hexagons/

import { HEX_SIZE } from './constants';

/** Point-to-point width is 2 * HEX_SIZE; flat-to-flat height is this. */
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

// Shifts the grid so tile (0, 0)'s hex sits fully inside the positive quadrant.
const ORIGIN_X = HEX_SIZE;
const ORIGIN_Y = HEX_HEIGHT / 2;

export interface HexCoord {
    col: number;
    row: number;
}

/** World-space center of a hex. */
export function hexCenter(col: number, row: number): { x: number; y: number } {
    return {
        x: ORIGIN_X + HEX_SIZE * 1.5 * col,
        y: ORIGIN_Y + HEX_HEIGHT * (row + 0.5 * (col & 1)),
    };
}

/** Pixel bounds of a cols x rows map (including the half-hex odd-column drop). */
export function mapPixelSize(cols: number, rows: number): { width: number; height: number } {
    return {
        width: HEX_SIZE * (1.5 * cols + 0.5),
        height: HEX_HEIGHT * (rows + 0.5),
    };
}

/** The hex containing a world-space point. May be outside the map — check with `isValidHex`. */
export function pixelToHex(x: number, y: number): HexCoord {
    const px = x - ORIGIN_X;
    const py = y - ORIGIN_Y;

    // Pixel -> fractional axial -> fractional cube.
    const q = ((2 / 3) * px) / HEX_SIZE;
    const r = ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / HEX_SIZE;
    const s = -q - r;

    // Cube rounding: round all three, then re-derive whichever axis rounded
    // worst from the other two. (If that's `s`, q and r are already right, and
    // only they are needed for the offset conversion below.)
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;

    // Axial -> odd-q offset.
    return { col: rq, row: rr + (rq - (rq & 1)) / 2 };
}

export function isValidHex(col: number, row: number, cols: number, rows: number): boolean {
    return (
        Number.isInteger(col) &&
        Number.isInteger(row) &&
        col >= 0 &&
        row >= 0 &&
        col < cols &&
        row < rows
    );
}

export function hexIndex(col: number, row: number, cols: number): number {
    return row * cols + col;
}
