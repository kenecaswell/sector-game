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

// Outward unit normals of a flat-top hex's six edges (at 30°, 90°, ... in y-down space).
const EDGE_NORMALS = Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 6 + (i * Math.PI) / 3;
    return { x: Math.cos(angle), y: Math.sin(angle) };
});

// Corners relative to the hex center (flat-top: at 0°, 60°, ...).
const CORNERS = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    return { x: HEX_SIZE * Math.cos(angle), y: HEX_SIZE * Math.sin(angle) };
});

/**
 * Where a world point sits relative to a hex, for circle-vs-hex collisions.
 * `distance` is the true distance to the hexagon's boundary (positive outside,
 * negative inside), so the region within r of a hex has rounded corners.
 * (nx, ny) is the direction to push a point out: the nearest edge's normal
 * along a flat side, or the direction away from the nearest corner near a
 * vertex, which lets a moving circle slide smoothly around it.
 *
 * Server-only (used for structure collisions); not copied to the client.
 */
export function hexEdgeContact(
    x: number,
    y: number,
    col: number,
    row: number
): { distance: number; nx: number; ny: number } {
    const center = hexCenter(col, row);
    const dx = x - center.x;
    const dy = y - center.y;

    // Signed distance to each edge's line: the largest is the nearest edge, and if it's
    // <= 0 the point is inside (and that value is exactly how far inside).
    let inside = { distance: -Infinity, nx: 0, ny: 0 };
    for (const normal of EDGE_NORMALS) {
        const distance = dx * normal.x + dy * normal.y - HEX_HEIGHT / 2; // HEX_HEIGHT/2 = inradius
        if (distance > inside.distance) inside = { distance, nx: normal.x, ny: normal.y };
    }
    if (inside.distance <= 0) return inside;

    // Outside: nearest point on the boundary (each of the six edges is a segment).
    let bestDistSq = Infinity;
    let bestX = 0;
    let bestY = 0;
    for (let i = 0; i < 6; i++) {
        const a = CORNERS[i];
        const b = CORNERS[(i + 1) % 6];
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
