// Hex grid math: everything shared with the client lives in shared/hex.ts (re-exported here, so
// import from this file as usual). Below is the server-only part: structure collisions.

import { hexCenter, STRUCTURE_RADIUS, STRUCTURE_ROTATION } from '../../shared/hex';

export * from '../../shared/hex';

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
