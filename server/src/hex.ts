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

// ---------------------------------------------------------------------------------------------
// Server-only below (structure collisions); not copied to the client.

interface ConvexShape {
    corners: Array<{ x: number; y: number }>; // relative to the shape's center, in order
    normals: Array<{ x: number; y: number }>; // outward unit normal of the edge corners[i] -> [i+1]
    inradius: number; // center-to-edge distance
}

function regularHexagon(circumradius: number, rotation: number): ConvexShape {
    const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = rotation + (i * Math.PI) / 3;
        return { x: circumradius * Math.cos(angle), y: circumradius * Math.sin(angle) };
    });
    const normals = Array.from({ length: 6 }, (_, i) => {
        const angle = rotation + Math.PI / 6 + (i * Math.PI) / 3;
        return { x: Math.cos(angle), y: Math.sin(angle) };
    });
    return { corners, normals, inradius: circumradius * Math.cos(Math.PI / 6) };
}

const STRUCTURE_SHAPE = regularHexagon(STRUCTURE_RADIUS, STRUCTURE_ROTATION);

/**
 * Where a point (dx, dy), relative to a shape's center, sits against that convex shape, for
 * circle-vs-shape collisions. `distance` is the true distance to the boundary (positive outside,
 * negative inside), so the region within r of the shape has rounded corners. (nx, ny) is the
 * direction to push a point out: the nearest edge's normal along a flat side, or the direction
 * away from the nearest corner near a vertex, which lets a moving circle slide smoothly around it.
 */
function shapeContact(
    dx: number,
    dy: number,
    shape: ConvexShape
): { distance: number; nx: number; ny: number } {
    // Signed distance to each edge's line: the largest is the nearest edge, and if it's
    // <= 0 the point is inside (and that value is exactly how far inside).
    let inside = { distance: -Infinity, nx: 0, ny: 0 };
    for (const normal of shape.normals) {
        const distance = dx * normal.x + dy * normal.y - shape.inradius;
        if (distance > inside.distance) inside = { distance, nx: normal.x, ny: normal.y };
    }
    if (inside.distance <= 0) return inside;

    // Outside: nearest point on the boundary (each edge is a segment).
    const { corners } = shape;
    let bestDistSq = Infinity;
    let bestX = 0;
    let bestY = 0;
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const abX = b.x - a.x;
        const abY = b.y - a.y;
        const t = Math.max(
            0,
            Math.min(1, ((dx - a.x) * abX + (dy - a.y) * abY) / (abX * abX + abY * abY))
        );
        const px = a.x + abX * t;
        const py = a.y + abY * t;
        const distSq = (dx - px) * (dx - px) + (dy - py) * (dy - py);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestX = px;
            bestY = py;
        }
    }
    const distance = Math.sqrt(bestDistSq);
    return distance > 0
        ? { distance, nx: (dx - bestX) / distance, ny: (dy - bestY) / distance }
        : inside;
}

/** `shapeContact` against the hexagon of a structure centered on hex (col, row). */
export function structureContact(
    x: number,
    y: number,
    col: number,
    row: number
): { distance: number; nx: number; ny: number } {
    const center = hexCenter(col, row);
    return shapeContact(x - center.x, y - center.y, STRUCTURE_SHAPE);
}
