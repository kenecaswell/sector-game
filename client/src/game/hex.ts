// Hex grid math: everything shared with the server lives in shared/hex.ts (re-exported here, so
// import from this file as usual). Below is the client-only part: the isometric projection.

import { HEX_SIZE, ISO_SQUASH } from './constants';
import { hexCenter, STRUCTURE_CORNER_OFFSETS } from '../../../shared/hex';

export * from '../../../shared/hex';

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
