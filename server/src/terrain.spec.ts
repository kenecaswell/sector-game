import { describe, expect, it } from 'vitest';
import {
    FEATURE_GAP,
    LAKE_SIZE,
    MOUNTAIN_SIZE,
    RIVER_LENGTH,
    RIVER_POCKET_FILL,
    RIVER_WIDTH,
    SPAWN_CLEAR_RADIUS,
    TERRAIN_COVERAGE,
} from './constants';
import { hexDistance, hexIndex, hexNeighbors, isValidHex, type HexCoord } from './hex';
import { generateTerrain, seededRandom, spawnHex, type GeneratedTerrain } from './terrain';
import { blocksWalking, isShallowWater } from '../../shared/terrain';
import { TERRAIN, type Terrain } from './types/shared';

const COLS = 64;
const ROWS = 64;
const at = (h: HexCoord) => hexIndex(h.col, h.row, COLS);
const onMap = (h: HexCoord) => isValidHex(h.col, h.row, COLS, ROWS);

// Checked against many layouts, because each rule has to hold for every map, not just one.
const maps: GeneratedTerrain[] = Array.from({ length: 40 }, (_, seed) =>
    generateTerrain(COLS, ROWS, seededRandom(seed + 1))
);

/** True if the hexes form one group, each touching another. */
function contiguous(hexes: HexCoord[]): boolean {
    const set = new Set(hexes.map(at));
    const seen = new Set([at(hexes[0])]);
    const queue = [hexes[0]];
    while (queue.length > 0) {
        const h = queue.pop()!;
        for (const n of hexNeighbors(h.col, h.row)) {
            if (set.has(at(n)) && !seen.has(at(n))) {
                seen.add(at(n));
                queue.push(n);
            }
        }
    }
    return seen.size === set.size;
}

describe('generateTerrain', () => {
    it('is repeatable for a seed, and different across seeds', () => {
        const again = generateTerrain(COLS, ROWS, seededRandom(1));
        expect(again.terrain).toEqual(maps[0].terrain);
        expect(maps[1].terrain).not.toEqual(maps[0].terrain);
    });

    it('makes about TERRAIN_COVERAGE of the map terrain; the rest is ground', () => {
        for (const map of maps) {
            const terrain = map.terrain.filter((t) => t !== TERRAIN.ground).length;
            expect(terrain / (COLS * ROWS)).toBeGreaterThanOrEqual(TERRAIN_COVERAGE);
            expect(terrain / (COLS * ROWS)).toBeLessThan(TERRAIN_COVERAGE + 0.01);
        }
    });

    it('uses every kind of feature, over the whole size range', () => {
        const all = maps.flatMap((m) => m.features);
        for (const kind of ['mountain', 'lake', 'river'] as const) {
            expect(
                all.some((f) => f.kind === kind),
                kind
            ).toBe(true);
        }
        // Small and large ranges and lakes both show up (not just one end of the range).
        for (const [kind, range] of [
            ['mountain', MOUNTAIN_SIZE],
            ['lake', LAKE_SIZE],
        ] as const) {
            const sizes = all.filter((f) => f.kind === kind).map((f) => f.hexes.length);
            expect(Math.min(...sizes), kind).toBeLessThanOrEqual(range.min + 2);
            expect(Math.max(...sizes), kind).toBeGreaterThanOrEqual(range.max - 4);
        }
    });

    it('keeps every feature contiguous and within its size limits', () => {
        for (const map of maps) {
            for (const f of map.features) {
                expect(contiguous(f.hexes), f.kind).toBe(true);
                expect(f.hexes.every(onMap)).toBe(true);
                if (f.kind === 'mountain') {
                    expect(f.hexes.length).toBeGreaterThanOrEqual(MOUNTAIN_SIZE.min);
                    expect(f.hexes.length).toBeLessThanOrEqual(MOUNTAIN_SIZE.max);
                } else if (f.kind === 'lake') {
                    expect(f.hexes.length).toBeGreaterThanOrEqual(LAKE_SIZE.min);
                    expect(f.hexes.length).toBeLessThanOrEqual(LAKE_SIZE.max);
                } else {
                    // A river's course is 2-20 hexes, each up to RIVER_WIDTH.max hexes across.
                    expect(f.length).toBeGreaterThanOrEqual(RIVER_LENGTH.min);
                    expect(f.length).toBeLessThanOrEqual(RIVER_LENGTH.max);
                    // (Hexes filled into holes at bends come on top of that.)
                    expect(f.hexes.length - f.filled!).toBeLessThanOrEqual(
                        RIVER_WIDTH.max * f.length!
                    );
                }
            }
        }
    });

    it('rivers range from 1 wide all along to wider than 2 in places', () => {
        const rivers = maps.flatMap((m) => m.features).filter((f) => f.kind === 'river');
        expect(rivers.some((r) => r.hexes.length === r.length)).toBe(true); // 1 wide all along
        expect(rivers.some((r) => r.hexes.length > 2 * r.length!)).toBe(true); // 3-4 wide stretches
    });

    it('marks mountains as mountain and lakes and rivers as water, and nothing else', () => {
        for (const map of maps) {
            const expected = new Array(COLS * ROWS).fill(TERRAIN.ground);
            for (const f of map.features) {
                for (const h of f.hexes) {
                    expected[at(h)] = f.kind === 'mountain' ? TERRAIN.mountain : TERRAIN.water;
                }
            }
            expect(map.terrain).toEqual(expected);
        }
    });

    it('keeps at least FEATURE_GAP ground hexes between any two features', () => {
        for (const map of maps) {
            const cells = map.features.flatMap((f, id) => f.hexes.map((h) => ({ ...h, id })));
            let closest = Infinity;
            for (let i = 0; i < cells.length; i++) {
                for (let j = i + 1; j < cells.length; j++) {
                    if (cells[i].id !== cells[j].id) {
                        closest = Math.min(closest, hexDistance(cells[i], cells[j]));
                    }
                }
            }
            expect(closest).toBeGreaterThan(FEATURE_GAP);
        }
    });

    it('leaves no holes in rivers: no free ground hex mostly surrounded by one river', () => {
        for (const map of maps) {
            const owner = new Map<number, number>();
            map.features.forEach((f, id) => f.hexes.forEach((h) => owner.set(at(h), id)));
            map.features.forEach((f, id) => {
                if (f.kind !== 'river') return;
                for (let i = 0; i < COLS * ROWS; i++) {
                    if (owner.has(i)) continue;
                    const h = { col: i % COLS, row: Math.floor(i / COLS) };
                    const ns = hexNeighbors(h.col, h.row).filter(onMap);
                    const around = ns.filter((n) => owner.get(at(n)) === id).length;
                    // A pocket may stay only where filling it would break a rule: next to another
                    // feature, or inside the spawn area.
                    const blocked =
                        ns.some((n) => owner.has(at(n)) && owner.get(at(n)) !== id) ||
                        hexDistance(h, map.spawn) <= SPAWN_CLEAR_RADIUS;
                    if (around >= RIVER_POCKET_FILL && !blocked) {
                        throw new Error(`hole at ${h.col},${h.row} in river ${id}`);
                    }
                }
            });
        }
    });

    it('never leaves lone water (lakes are 3+, rivers 2+)', () => {
        for (const map of maps) {
            const isWater = (c: number, r: number) =>
                onMap({ col: c, row: r }) && map.terrain[at({ col: c, row: r })] === TERRAIN.water;
            const lone = map.terrain.filter((t, i) => {
                const h = { col: i % COLS, row: Math.floor(i / COLS) };
                return (
                    t === TERRAIN.water &&
                    hexNeighbors(h.col, h.row).every((n) => !isWater(n.col, n.row))
                );
            });
            expect(lone).toHaveLength(0);
        }
    });

    it('shallow water comes from 1-wide river stretches (lakes are all but never shallow)', () => {
        let inRivers = 0;
        let inLakes = 0;
        for (const map of maps) {
            const isWater = (c: number, r: number) =>
                onMap({ col: c, row: r }) && map.terrain[at({ col: c, row: r })] === TERRAIN.water;
            for (const f of map.features) {
                if (f.kind === 'mountain') continue;
                const shallow = f.hexes.filter((h) => isShallowWater(isWater, h.col, h.row)).length;
                if (f.kind === 'river') inRivers += shallow;
                else inLakes += shallow;
            }
        }
        expect(inRivers).toBeGreaterThan(100);
        expect(inLakes).toBeLessThan(inRivers / 50);
    });

    it('keeps the spawn area clear', () => {
        for (const map of maps) {
            expect(map.spawn).toEqual(spawnHex(COLS, ROWS));
            for (let i = 0; i < COLS * ROWS; i++) {
                const h = { col: i % COLS, row: Math.floor(i / COLS) };
                if (hexDistance(h, map.spawn) <= SPAWN_CLEAR_RADIUS) {
                    expect(map.terrain[i]).toBe(TERRAIN.ground);
                }
            }
        }
    });

    it('leaves every ground hex reachable on foot from the spawn (no Wings needed)', () => {
        for (const map of maps) {
            const isWater = (c: number, r: number) =>
                onMap({ col: c, row: r }) && map.terrain[at({ col: c, row: r })] === TERRAIN.water;
            const walkable = (h: HexCoord) =>
                map.terrain[at(h)] === TERRAIN.ground ||
                (map.terrain[at(h)] === TERRAIN.water && isShallowWater(isWater, h.col, h.row));
            const reached = new Set([at(map.spawn)]);
            const queue = [map.spawn];
            while (queue.length > 0) {
                const h = queue.pop()!;
                for (const n of hexNeighbors(h.col, h.row)) {
                    if (!onMap(n) || reached.has(at(n)) || !walkable(n)) continue;
                    reached.add(at(n));
                    queue.push(n);
                }
            }
            const unreachable = map.terrain.filter(
                (t, i) => t === TERRAIN.ground && !reached.has(i)
            );
            expect(unreachable).toHaveLength(0);
        }
    });

    it('is quick enough to run when a room is created (well under a tick)', () => {
        const start = performance.now();
        for (let seed = 100; seed < 110; seed++) generateTerrain(COLS, ROWS, seededRandom(seed));
        expect((performance.now() - start) / 10).toBeLessThan(50); // ms per map
    });
});

describe('mountain ranges', () => {
    const ranges = maps.flatMap((m) => m.features).filter((f) => f.kind === 'mountain');
    const key = (h: HexCoord) => at(h);
    const touch = (a: HexCoord, b: HexCoord) =>
        hexNeighbors(a.col, a.row).some((n) => key(n) === key(b));

    it('are made of small mountains (3 hexes that all touch) and large ones (a hex and its 6 neighbors)', () => {
        const sizes = new Set<string>();
        for (const range of ranges) {
            for (const piece of range.pieces!) {
                sizes.add(piece.size);
                if (piece.size === 'small') {
                    const [a, b, c] = piece.hexes;
                    expect(piece.hexes).toHaveLength(3);
                    expect(touch(a, b) && touch(b, c) && touch(a, c)).toBe(true);
                } else {
                    const [center, ...ring] = piece.hexes;
                    expect(ring).toHaveLength(6);
                    expect(ring.every((h) => touch(center, h))).toBe(true);
                }
            }
        }
        expect([...sizes].sort()).toEqual(['large', 'small']);
    });

    it("whose pieces never overlap and make up exactly the range's hexes", () => {
        for (const range of ranges) {
            const fromPieces = range.pieces!.flatMap((p) => p.hexes.map(key));
            expect(new Set(fromPieces).size).toBe(fromPieces.length);
            expect(new Set(fromPieces)).toEqual(new Set(range.hexes.map(key)));
        }
    });

    it('grow compact: on average a mountain hex has at least 3.7 mountain neighbors (lacy ranges had ~3.45)', () => {
        const ratios = ranges.map((range) => {
            const set = new Set(range.hexes.map(key));
            const inner = range.hexes.reduce(
                (sum, h) => sum + hexNeighbors(h.col, h.row).filter((n) => set.has(key(n))).length,
                0
            );
            return inner / range.hexes.length;
        });
        expect(ratios.reduce((a, b) => a + b, 0) / ratios.length).toBeGreaterThanOrEqual(3.7);
    });
});

describe('lakes', () => {
    const lakes = maps.flatMap((m) => m.features).filter((f) => f.kind === 'lake');

    it('grow compact: at least 3.7 lake neighbors per lake hex on average', () => {
        const ratios = lakes.map((lake) => {
            const set = new Set(lake.hexes.map(at));
            const inner = lake.hexes.reduce(
                (sum, h) => sum + hexNeighbors(h.col, h.row).filter((n) => set.has(at(n))).length,
                0
            );
            return inner / lake.hexes.length;
        });
        expect(ratios.reduce((a, b) => a + b, 0) / ratios.length).toBeGreaterThanOrEqual(3.7);
    });

    it('have no holes: no ground hex with 4 or more neighbors in one lake', () => {
        for (const lake of lakes) {
            const set = new Set(lake.hexes.map(at));
            for (const h of lake.hexes) {
                for (const n of hexNeighbors(h.col, h.row)) {
                    if (!onMap(n) || set.has(at(n))) continue;
                    const around = hexNeighbors(n.col, n.row).filter((m) => set.has(at(m))).length;
                    expect(around).toBeLessThan(4);
                }
            }
        }
    });
});

describe('isShallowWater', () => {
    // A small patch of water around (10, 10), given as the neighbor directions that are water.
    const center = { col: 10, row: 10 };
    const around = hexNeighbors(center.col, center.row);
    const shallowWith = (directions: number[]) => {
        const water = new Set([at(center), ...directions.map((k) => at(around[k]))]);
        return isShallowWater((c, r) => water.has(at({ col: c, row: r })), center.col, center.row);
    };

    it('lone water and the end of a line are shallow', () => {
        expect(shallowWith([])).toBe(true);
        expect(shallowWith([2])).toBe(true);
    });

    it('a 1-wide line is shallow, straight or bent 60°', () => {
        expect(shallowWith([2, 5])).toBe(true); // straight through
        expect(shallowWith([0, 2])).toBe(true); // a bend: the two neighbors don't touch
    });

    it('water whose two water neighbors touch (a triangle) is deep, and so is 3+ neighbors', () => {
        expect(shallowWith([0, 1])).toBe(false);
        expect(shallowWith([5, 0])).toBe(false); // wraps around: directions 5 and 0 touch too
        expect(shallowWith([0, 2, 4])).toBe(false);
    });
});

describe('blocksWalking', () => {
    const at = (map: Record<string, Terrain>) => (c: number, r: number) =>
        c < 0 ? undefined : (map[`${c},${r}`] ?? TERRAIN.ground);

    it('mountains and deep water block; ground, shallow water and off-map do not', () => {
        const lake: Record<string, Terrain> = { '10,10': TERRAIN.water };
        for (const n of hexNeighbors(10, 10)) lake[`${n.col},${n.row}`] = TERRAIN.water;
        expect(blocksWalking(at({ '5,5': TERRAIN.mountain }), 5, 5)).toBe(true);
        expect(blocksWalking(at(lake), 10, 10)).toBe(true); // surrounded by water: deep
        expect(blocksWalking(at({ '5,5': TERRAIN.water }), 5, 5)).toBe(false); // lone: shallow
        expect(blocksWalking(at({}), 5, 5)).toBe(false);
        expect(blocksWalking(at({}), -1, 5)).toBe(false);
    });
});

describe('seededRandom', () => {
    it('returns the same sequence for the same seed, in [0, 1)', () => {
        const a = seededRandom(42);
        const b = seededRandom(42);
        const values = Array.from({ length: 1000 }, () => a());
        expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
        expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    });
});
