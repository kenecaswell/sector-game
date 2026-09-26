// HAND-COPY of server/src/hex.ts (top section) plus the isometric projection
// helpers at the bottom, which are client-only. Keep the shared math in sync.
//
// Flat-top hex grid math, "odd-q" offset layout: odd columns are shoved down
// half a hex. Tiles live in a flat array indexed `row * cols + col`.
//
// Everything here is in the server's logical, top-down world space (pixels,
// y down). The client's isometric look is purely a render-time transform
// (see the projection helpers at the bottom of this file) — the simulation
// never sees it.
//
// Reference: https://www.redblobgames.com/grids/hexagons/

import { HEX_SIZE, ISO_SQUASH } from './constants';

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

// --- Structures ----------------------------------------------------------------------------------
// A structure is centered on a hex and occupies it plus its 6 neighbors (its "footprint"). Its
// solid, drawn shape is a flat-top hexagon (like the tiles) with twice a tile's radius: the largest
// flat-top hexagon that fits inside the footprint — each corner lands exactly on a notch where two
// outer hexes meet. So it never reaches outside its footprint, and structures never overlap.
export const STRUCTURE_RADIUS = 2 * HEX_SIZE;
const STRUCTURE_ROTATION = 0; // flat top, like the tiles

/** The structure hexagon's corners relative to its center hex's center (world space, clockwise). */
export const STRUCTURE_CORNER_OFFSETS = Array.from({ length: 6 }, (_, i) => {
    const angle = STRUCTURE_ROTATION + (i * Math.PI) / 3;
    return { x: STRUCTURE_RADIUS * Math.cos(angle), y: STRUCTURE_RADIUS * Math.sin(angle) };
});

// Odd-q neighbor offsets (dcol, drow), clockwise from upper right. Odd columns sit half a hex lower.
const EVEN_COL_NEIGHBORS = [
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
];
const ODD_COL_NEIGHBORS = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
];

/** The six hexes around (col, row). Some may be off the map — check with `isValidHex`. */
export function hexNeighbors(col: number, row: number): HexCoord[] {
    const offsets = col & 1 ? ODD_COL_NEIGHBORS : EVEN_COL_NEIGHBORS;
    return offsets.map(([dc, dr]) => ({ col: col + dc, row: row + dr }));
}

/** The 7 hexes a structure centered on (col, row) occupies, center first. */
export function structureFootprint(col: number, row: number): HexCoord[] {
    return [{ col, row }, ...hexNeighbors(col, row)];
}

/** True if hex (col, row) is part of the footprint of a structure centered on (centerCol, centerRow). */
export function inStructureFootprint(
    col: number,
    row: number,
    centerCol: number,
    centerRow: number
): boolean {
    return structureFootprint(centerCol, centerRow).some((h) => h.col === col && h.row === row);
}

// ---------------------------------------------------------------------------
// Isometric projection (client-only)
// ---------------------------------------------------------------------------

export interface Point {
    x: number;
    y: number;
}

/** World (top-down) -> screen/scene space. */
export function project(x: number, y: number): Point {
    return { x, y: y * ISO_SQUASH };
}

/** Screen/scene space -> world (top-down). Inverse of `project`. */
export function unproject(x: number, y: number): Point {
    return { x, y: y / ISO_SQUASH };
}

/** The six corners of a hex in projected space, starting at the right-hand point and going clockwise on screen. */
export function hexCorners(col: number, row: number): Point[] {
    const center = hexCenter(col, row);
    const corners: Point[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        corners.push(
            project(center.x + HEX_SIZE * Math.cos(angle), center.y + HEX_SIZE * Math.sin(angle))
        );
    }
    return corners;
}

/** The structure hexagon for a structure centered on (col, row), in projected space. */
export function structureCorners(col: number, row: number): Point[] {
    const center = hexCenter(col, row);
    return STRUCTURE_CORNER_OFFSETS.map((c) => project(center.x + c.x, center.y + c.y));
}
