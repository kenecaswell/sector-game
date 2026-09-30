import { describe, expect, it } from 'vitest';
import { hexCenter, hexCorners, hexNeighbors, project } from './hex';
import { ISO_SQUASH } from './constants';
import {
    GROUND_SLATE,
    SNOW_LIGHT,
    groundColor,
    groundDetails,
    valueNoise,
    convexHull,
    hexSeed,
    mixColor,
    mountainModel,
    pebbles,
    rippleMarks,
    seededRandom,
} from './terrainArt';

/** The model for a mountain on the given hexes (col, row). */
function mountainOn(hexes: Array<{ col: number; row: number }>, seed = 1) {
    const corners = hexes.flatMap((h) => hexCorners(h.col, h.row));
    const centers = hexes.map((h) => {
        const c = hexCenter(h.col, h.row);
        return project(c.x, c.y);
    });
    return { model: modelFor(corners, centers, hexes.length === 7, seed), centers };
}
const modelFor = (
    corners: Array<{ x: number; y: number }>,
    centers: Array<{ x: number; y: number }>,
    large: boolean,
    seed: number
) => mountainModel(corners, centers, large, seed, ISO_SQUASH);

const large = [{ col: 10, row: 10 }, ...hexNeighbors(10, 10)];
// Three hexes that all touch: (10, 10), its lower-right neighbor, and the one below it.
const small = [{ col: 10, row: 10 }, hexNeighbors(10, 10)[1], hexNeighbors(10, 10)[2]];

describe('convexHull', () => {
    it('keeps the outer points of a shape, in order, and drops the inner ones', () => {
        const hull = convexHull([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 5, y: 5 },
            { x: 5, y: 0 }, // on an edge
        ]);
        expect(hull).toHaveLength(4);
        expect(hull).not.toContainEqual({ x: 5, y: 5 });
    });
});

describe('mountainModel', () => {
    it('is the same mountain for the same seed, and a different one for another', () => {
        const a = mountainOn(large, 7).model;
        const b = mountainOn(large, 7).model;
        const c = mountainOn(large, 8).model;
        expect(b).toEqual(a);
        expect(c.facets).not.toEqual(a.facets);
    });

    it('stands on the middle of its hexes, and its bounds hold everything it draws', () => {
        for (const hexes of [small, large]) {
            const { model, centers } = mountainOn(hexes);
            const mid = centers.reduce((s, c) => s + c.x, 0) / centers.length;
            expect(model.anchor.x).toBeCloseTo(mid);
            for (const facet of model.facets) {
                for (const p of facet.points) {
                    expect(p.x).toBeGreaterThanOrEqual(model.bounds.minX);
                    expect(p.x).toBeLessThanOrEqual(model.bounds.maxX);
                    expect(p.y).toBeGreaterThanOrEqual(model.bounds.minY);
                    expect(p.y).toBeLessThanOrEqual(model.bounds.maxY);
                }
            }
        }
    });

    it('a 7-hex mountain is taller and wider than a 3-hex one, and both have snow on top', () => {
        const big = mountainOn(large).model;
        const little = mountainOn(small).model;
        const height = (m: typeof big) => m.anchor.y - m.bounds.minY;
        const width = (m: typeof big) => m.bounds.maxX - m.bounds.minX;
        expect(height(big)).toBeGreaterThan(height(little) + 25);
        expect(width(big)).toBeGreaterThan(width(little));
        for (const m of [big, little]) {
            // The highest point is snow: the facet reaching the top is a snowy (light) color.
            const top = m.facets.find((f) => f.points.some((p) => p.y === m.bounds.minY))!;
            const blue = top.color & 0xff;
            expect(blue).toBeGreaterThan(0xa0);
        }
        expect(mixColor(SNOW_LIGHT, SNOW_LIGHT, 0.3)).toBe(SNOW_LIGHT);
    });

    it('draws back to front', () => {
        const { model } = mountainOn(large);
        const depths = model.facets.map((f) => f.depth);
        expect(depths).toEqual([...depths].sort((a, b) => a - b));
    });
});

describe('water details and randomness', () => {
    it('ripples and pebbles stay on their hex, and repeat for the same seed', () => {
        const center = { x: 100, y: 50 };
        const marks = rippleMarks(center, 3, 3);
        expect(marks).toHaveLength(3);
        for (const wave of marks) {
            expect(wave).toHaveLength(5);
            for (const p of wave) {
                expect(Math.abs(p.x - center.x)).toBeLessThan(28);
                expect(Math.abs(p.y - center.y)).toBeLessThan(10);
            }
        }
        expect(pebbles(center, 5)).toEqual(pebbles(center, 5));
        for (const [x, y] of pebbles(center, 5)) {
            expect(Math.abs(x - center.x)).toBeLessThanOrEqual(20);
            expect(Math.abs(y - center.y)).toBeLessThanOrEqual(10);
        }
    });

    it('seeded numbers are in [0, 1) and repeatable; hex seeds differ between neighbors', () => {
        const r = seededRandom(42);
        const values = Array.from({ length: 100 }, r);
        expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
        expect(Array.from({ length: 100 }, seededRandom(42))).toEqual(values);
        expect(hexSeed(100)).not.toBe(hexSeed(101));
        expect(hexSeed(100, 1)).not.toBe(hexSeed(100, 2));
    });

    it('mixes colors channel by channel', () => {
        expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
        expect(mixColor(0x102030, 0x102030, 0.9)).toBe(0x102030);
        expect(mixColor(0xff0000, 0x0000ff, 2)).toBe(0x0000ff); // clamped
    });
});

describe('ground', () => {
    it('noise is smooth, in [0, 1), and the same for the same seed', () => {
        let previous = valueNoise(0, 0, 100, 3);
        for (let x = 1; x < 1000; x++) {
            const v = valueNoise(x, 37, 100, 3);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
            expect(Math.abs(v - previous)).toBeLessThan(0.05); // no jumps between neighbors
            previous = v;
        }
        expect(valueNoise(123, 456, 100, 3)).toBe(valueNoise(123, 456, 100, 3));
    });

    it('is mostly slate, with patches of brown and maroon across the map, never far from slate', () => {
        const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
        let warm = 0;
        let total = 0;
        for (let row = 0; row < 64; row++) {
            for (let col = 0; col < 64; col++) {
                const c = hexCenter(col, row);
                const color = groundColor(project(c.x, c.y), row * 64 + col);
                const [r, g, b] = channels(color);
                const [sr, sg, sb] = channels(GROUND_SLATE);
                // Subtle: each channel within 30 of slate.
                expect(Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb))).toBeLessThan(
                    30
                );
                if (r > sr + 6) warm++;
                total++;
            }
        }
        expect(warm / total).toBeGreaterThan(0.1); // there are dusty patches ...
        expect(warm / total).toBeLessThan(0.6); // ... but slate is still the ground
    });

    it("keeps a tile's texture inside its top, faint, and the same every time", () => {
        const center = { x: 500, y: 300 };
        const details = groundDetails(center, 42, 0.5);
        expect(groundDetails(center, 42, 0.5)).toEqual(details);
        expect(details.grains.length).toBeGreaterThanOrEqual(4);
        for (const grain of details.grains) {
            expect(Math.abs(grain.x - center.x)).toBeLessThanOrEqual(22);
            expect(Math.abs(grain.y - center.y)).toBeLessThanOrEqual(11);
            expect(grain.alpha).toBeLessThanOrEqual(0.4);
        }
        // Across many tiles, some have cracks and some frost, most have neither.
        const many = Array.from({ length: 400 }, (_, i) => groundDetails(center, i, 0.5));
        const cracked = many.filter((d) => d.cracks.length > 0).length;
        expect(cracked).toBeGreaterThan(40);
        expect(cracked).toBeLessThan(200);
        expect(many.some((d) => d.frost.length > 0)).toBe(true);
    });
});
