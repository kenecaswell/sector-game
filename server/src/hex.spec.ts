// The hex math in shared/hex.ts (re-exported here) plus the server-only structureContact.
import { describe, expect, it } from 'vitest';
import { HEX_SIZE } from './constants';
import {
    STRUCTURE_CORNER_OFFSETS,
    STRUCTURE_RADIUS,
    compactFootprint,
    hexCenter,
    hexDistance,
    hexIndex,
    hexNeighbors,
    inStructureFootprint,
    isValidHex,
    mapPixelSize,
    nearestCompactRotation,
    pixelToHex,
    structureContact,
    structureFootprint,
} from './hex';

const R = HEX_SIZE;
const key = (h: { col: number; row: number }) => `${h.col},${h.row}`;
const farm = (tileX: number, tileY: number) => ({ type: 'farm', tileX, tileY, rotation: 0 });

describe('hex grid', () => {
    it('hexCenter -> pixelToHex round-trips for all 4,096 tiles, from 6 points inside each', () => {
        let mismatches = 0;
        for (let col = 0; col < 64; col++) {
            for (let row = 0; row < 64; row++) {
                const c = hexCenter(col, row);
                for (const [dx, dy] of [
                    [0, 0],
                    [20, 0],
                    [-20, 0],
                    [0, 20],
                    [0, -20],
                    [10, -15],
                ]) {
                    const h = pixelToHex(c.x + dx, c.y + dy);
                    if (h.col !== col || h.row !== row) mismatches++;
                }
            }
        }
        expect(mismatches).toBe(0);
    });

    it('bounds-checks and indexes hexes', () => {
        expect(isValidHex(0, 0, 64, 64)).toBe(true);
        expect(isValidHex(63, 63, 64, 64)).toBe(true);
        expect(isValidHex(64, 0, 64, 64)).toBe(false);
        expect(isValidHex(-1, 0, 64, 64)).toBe(false);
        expect(isValidHex(1.5, 0, 64, 64)).toBe(false);
        expect(hexIndex(3, 2, 64)).toBe(2 * 64 + 3);
    });

    it('hexDistance counts steps between hexes, on even and odd columns', () => {
        expect(hexDistance({ col: 10, row: 10 }, { col: 10, row: 10 })).toBe(0);
        for (const [col, row] of [
            [10, 10],
            [11, 10],
        ]) {
            for (const n of hexNeighbors(col, row)) expect(hexDistance({ col, row }, n)).toBe(1);
        }
        expect(hexDistance({ col: 0, row: 0 }, { col: 0, row: 5 })).toBe(5);
        expect(hexDistance({ col: 0, row: 0 }, { col: 6, row: 0 })).toBe(6);
    });

    it('sizes the map to include the half-hex drop of odd columns', () => {
        expect(mapPixelSize(64, 64)).toEqual({
            width: R * (1.5 * 64 + 0.5),
            height: Math.sqrt(3) * R * 64.5,
        });
    });

    it.each([
        [10, 10],
        [11, 10],
        [0, 0],
        [63, 63],
    ])('hexNeighbors(%i, %i) gives the 6 adjacent hexes', (col, row) => {
        const center = hexCenter(col, row);
        const neighbors = hexNeighbors(col, row);
        expect(new Set(neighbors.map(key)).size).toBe(6);
        for (const n of neighbors) {
            const c = hexCenter(n.col, n.row);
            expect(Math.hypot(c.x - center.x, c.y - center.y)).toBeCloseTo(Math.sqrt(3) * R, 9);
        }
    });
});

describe('structure footprint and hexagon', () => {
    it('the footprint is the center hex plus its 6 neighbors', () => {
        const footprint = structureFootprint(20, 20);
        expect(footprint[0]).toEqual({ col: 20, row: 20 });
        expect(footprint.slice(1)).toEqual(hexNeighbors(20, 20));
        expect(inStructureFootprint(21, 20, 20, 20)).toBe(true);
        expect(inStructureFootprint(22, 20, 20, 20)).toBe(false);
    });

    it('the hexagon is flat-topped with twice a hex radius (the area of 4 hexes)', () => {
        expect(STRUCTURE_RADIUS).toBe(2 * R);
        expect(STRUCTURE_CORNER_OFFSETS[0].x).toBeCloseTo(2 * R, 9);
        expect(STRUCTURE_CORNER_OFFSETS[0].y).toBeCloseTo(0, 9);
        let area = 0;
        STRUCTURE_CORNER_OFFSETS.forEach((a, i) => {
            const b = STRUCTURE_CORNER_OFFSETS[(i + 1) % 6];
            area += a.x * b.y - b.x * a.y;
        });
        const hexArea = ((3 * Math.sqrt(3)) / 2) * R * R;
        expect(Math.abs(area) / 2 / hexArea).toBeCloseTo(4, 9);
    });

    it("its corners are grid vertices (corners of the footprint's outer hexes)", () => {
        const center = hexCenter(20, 20);
        for (const corner of STRUCTURE_CORNER_OFFSETS) {
            const p = { x: center.x + corner.x, y: center.y + corner.y };
            const onGrid = structureFootprint(20, 20).some((h) => {
                const hc = hexCenter(h.col, h.row);
                return [0, 1, 2, 3, 4, 5].some((k) => {
                    const a = (k * Math.PI) / 3;
                    return (
                        Math.hypot(hc.x + R * Math.cos(a) - p.x, hc.y + R * Math.sin(a) - p.y) <
                        1e-6
                    );
                });
            });
            expect(onGrid).toBe(true);
        }
    });

    it('lies entirely inside its 7-hex footprint (sampled a hair inside its edge)', () => {
        const center = hexCenter(20, 20);
        const footprint = new Set(structureFootprint(20, 20).map(key));
        let outside = 0;
        for (let u = -1; u <= 1; u += 0.02) {
            for (let v = -1; v <= 1; v += 0.02) {
                const x = center.x + u * 2 * R * 0.999;
                const y = center.y + v * Math.sqrt(3) * R * 0.999;
                if (structureContact(x, y, farm(20, 20)).distance > -0.01) continue; // not inside
                if (!footprint.has(key(pixelToHex(x, y)))) outside++;
            }
        }
        expect(outside).toBe(0);
    });

    it('never overlaps a structure whose footprint is separate', () => {
        // Separating-axis test between two convex hexagons: the smallest overlap along any edge
        // normal; <= 0 means they're apart or just touching.
        const poly = (col: number, row: number) => {
            const c = hexCenter(col, row);
            return STRUCTURE_CORNER_OFFSETS.map((o) => ({ x: c.x + o.x, y: c.y + o.y }));
        };
        const overlapDepth = (p: { x: number; y: number }[], q: { x: number; y: number }[]) => {
            let min = Infinity;
            for (const shape of [p, q]) {
                shape.forEach((a, i) => {
                    const b = shape[(i + 1) % 6];
                    const nx = b.y - a.y;
                    const ny = a.x - b.x;
                    const len = Math.hypot(nx, ny);
                    const proj = (pts: typeof p) => pts.map((v) => (v.x * nx + v.y * ny) / len);
                    const pp = proj(p);
                    const qq = proj(q);
                    min = Math.min(
                        min,
                        Math.max(...pp) - Math.min(...qq),
                        Math.max(...qq) - Math.min(...pp)
                    );
                });
            }
            return min;
        };
        let pairs = 0;
        let worst = -Infinity;
        for (const [col, row] of [
            [20, 20],
            [21, 20],
        ]) {
            const base = new Set(structureFootprint(col, row).map(key));
            for (let c = col - 5; c <= col + 5; c++) {
                for (let r = row - 5; r <= row + 5; r++) {
                    if (structureFootprint(c, r).some((h) => base.has(key(h)))) continue;
                    pairs++;
                    worst = Math.max(worst, overlapDepth(poly(col, row), poly(c, r)));
                }
            }
        }
        expect(pairs).toBeGreaterThan(100);
        expect(worst).toBeLessThan(1e-6);
    });
});

describe('structureContact', () => {
    const center = hexCenter(10, 10);
    const inradius = STRUCTURE_RADIUS * Math.cos(Math.PI / 6);

    it('is negative inside (by exactly how far) and positive outside', () => {
        expect(structureContact(center.x, center.y, farm(10, 10)).distance).toBeCloseTo(
            -inradius,
            9
        );
        const below = structureContact(center.x, center.y + inradius + 5, farm(10, 10));
        expect(below.distance).toBeCloseTo(5, 9);
    });

    it('pushes out along the edge normal on a flat side', () => {
        const below = structureContact(center.x, center.y + inradius + 5, farm(10, 10));
        expect(below.nx).toBeCloseTo(0, 9);
        expect(below.ny).toBeCloseTo(1, 9); // straight down, away from the bottom edge
    });

    it('pushes away from the corner near a vertex, measuring true distance', () => {
        const corner = STRUCTURE_CORNER_OFFSETS[0]; // the right-hand point
        const contact = structureContact(
            center.x + corner.x + 6,
            center.y + corner.y,
            farm(10, 10)
        );
        expect(contact.distance).toBeCloseTo(6, 9);
        expect(contact.nx).toBeCloseTo(1, 9);
        expect(contact.ny).toBeCloseTo(0, 9);
    });
});

describe('compactFootprint (the 3-hex Guard Tower)', () => {
    it('is the anchor plus two neighbors that touch each other, in all six turns', () => {
        for (let rotation = 0; rotation < 6; rotation++) {
            const hexes = compactFootprint(20, 20, rotation);
            expect(hexes).toHaveLength(3);
            expect(hexes[0]).toEqual({ col: 20, row: 20 });
            for (const a of hexes) {
                for (const b of hexes) {
                    if (a !== b) expect(hexDistance(a, b)).toBe(1);
                }
            }
        }
    });

    it('gives six different clumps around an anchor, and wraps the rotation', () => {
        const clumps = new Set(
            Array.from({ length: 6 }, (_, k) =>
                compactFootprint(21, 20, k).map(key).sort().join('|')
            )
        );
        expect(clumps.size).toBe(6);
        expect(compactFootprint(21, 20, 7).map(key)).toEqual(compactFootprint(21, 20, 1).map(key));
        expect(compactFootprint(21, 20, -1).map(key)).toEqual(compactFootprint(21, 20, 5).map(key));
    });
});

describe('structureContact for a Guard Tower', () => {
    const tower = { type: 'guardTower', tileX: 20, tileY: 20, rotation: 2 };

    it('is inside each of its three hexes and outside the rest', () => {
        for (const hex of compactFootprint(20, 20, 2)) {
            const c = hexCenter(hex.col, hex.row);
            expect(structureContact(c.x, c.y, tower).distance).toBeLessThan(0);
        }
        const away = hexCenter(26, 20);
        expect(structureContact(away.x, away.y, tower).distance).toBeGreaterThan(0);
    });

    it('does not cover the 7-hex area a farm would', () => {
        const unused = hexNeighbors(20, 20).filter(
            (h) => !compactFootprint(20, 20, 2).some((t) => key(t) === key(h))
        )[0];
        const c = hexCenter(unused.col, unused.row);
        expect(structureContact(c.x, c.y, tower).distance).toBeGreaterThan(0);
        expect(structureContact(c.x, c.y, farm(20, 20)).distance).toBeLessThan(0);
    });
});

describe('nearestCompactRotation', () => {
    it('picks the clump centered nearest the point, so every rotation can be chosen', () => {
        const picked = new Set<number>();
        for (let rotation = 0; rotation < 6; rotation++) {
            const centers = compactFootprint(20, 20, rotation).map((h) => hexCenter(h.col, h.row));
            const x = centers.reduce((sum, c) => sum + c.x, 0) / 3;
            const y = centers.reduce((sum, c) => sum + c.y, 0) / 3;
            expect(nearestCompactRotation(20, 20, x, y)).toBe(rotation);
            picked.add(nearestCompactRotation(20, 20, x, y));
        }
        expect(picked.size).toBe(6);
    });

    it('works on odd columns too', () => {
        const c = hexCenter(21, 20);
        const rotation = nearestCompactRotation(21, 20, c.x + 30, c.y - 25);
        expect(rotation).toBeGreaterThanOrEqual(0);
        expect(rotation).toBeLessThan(6);
    });
});
