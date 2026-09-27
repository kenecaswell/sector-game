import { describe, expect, it } from 'vitest';
import {
    PICKUP_AMMO,
    PICKUP_CHANCES,
    PICKUP_MATERIALS,
    PICKUP_GRID,
    SPAWN_CLEAR_RADIUS,
} from './constants';
import { hexDistance, hexIndex } from './hex';
import { generatePickups, rollPickup } from './pickups';
import { generateTerrain, seededRandom, spawnHexes } from './terrain';
import { SHOP_ITEMS, TERRAIN, UPGRADE_IDS, type Terrain } from './types/shared';

const COLS = 64;
const ROWS = 64;
const LOCATIONS = PICKUP_GRID.cols * PICKUP_GRID.rows;

describe('pickup rolls', () => {
    it('the chances add up to 100%', () => {
        expect(Object.values(PICKUP_CHANCES).reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('come out in about the configured proportions, with amounts in range', () => {
        const random = seededRandom(7);
        const counts: Record<string, number> = {};
        const N = 20_000;
        for (let i = 0; i < N; i++) {
            const roll = rollPickup(random);
            let key = 'nothing';
            if (roll?.kind === 'materials') {
                key = 'materials';
                expect(roll.amount).toBeGreaterThanOrEqual(PICKUP_MATERIALS.min);
                expect(roll.amount).toBeLessThanOrEqual(PICKUP_MATERIALS.max);
            } else if (roll?.kind === 'ammo') {
                key = 'ammo';
                expect(roll.amount).toBeGreaterThanOrEqual(PICKUP_AMMO.min);
                expect(roll.amount).toBeLessThanOrEqual(PICKUP_AMMO.max);
            } else if (roll) {
                const item = SHOP_ITEMS[roll.itemId as keyof typeof SHOP_ITEMS];
                if (item.upgrade) key = 'upgrade';
                else if (item.structure) key = 'structure';
                else key = roll.itemId; // basicGun / bigGun
            }
            counts[key] = (counts[key] ?? 0) + 1;
        }
        for (const [key, percent] of Object.entries(PICKUP_CHANCES)) {
            expect((counts[key] ?? 0) / N, key).toBeCloseTo(percent / 100, 1);
        }
    });

    it('an upgrade pickup is any of the upgrades', () => {
        const random = seededRandom(3);
        const seen = new Set<string>();
        for (let i = 0; i < 5000; i++) {
            const roll = rollPickup(random);
            if (roll?.kind === 'item' && SHOP_ITEMS[roll.itemId as 'booster'].upgrade) {
                seen.add(roll.itemId);
            }
        }
        expect([...seen].sort()).toEqual([...UPGRADE_IDS].sort());
    });
});

describe('pickup placement', () => {
    const maps = Array.from({ length: 30 }, (_, seed) => {
        const random = seededRandom(seed + 1);
        const { terrain } = generateTerrain(COLS, ROWS, random);
        return { terrain, pickups: generatePickups(terrain, COLS, ROWS, random) };
    });

    it('places at most one per grid cell, on distinct ground hexes outside the spawn areas', () => {
        const spawns = spawnHexes(COLS, ROWS);
        for (const { terrain, pickups } of maps) {
            expect(pickups.length).toBeLessThanOrEqual(LOCATIONS);
            const hexes = new Set(pickups.map((p) => hexIndex(p.col, p.row, COLS)));
            expect(hexes.size).toBe(pickups.length);
            for (const p of pickups) {
                expect(terrain[hexIndex(p.col, p.row, COLS)]).toBe(TERRAIN.ground);
                for (const s of spawns) {
                    expect(hexDistance(p, s)).toBeGreaterThan(SPAWN_CLEAR_RADIUS);
                }
            }
        }
        // "Nothing" is 5%, so most maps have 11 or 12.
        const average = maps.reduce((n, m) => n + m.pickups.length, 0) / maps.length;
        expect(average).toBeGreaterThan(LOCATIONS * 0.85);
    });

    it('spreads them evenly: one near the middle of each grid cell', () => {
        const all = new Array<Terrain>(COLS * ROWS).fill(TERRAIN.ground);
        // Always "materials", so every location gets one.
        const pickups = generatePickups(all, COLS, ROWS, () => 0);
        expect(pickups).toHaveLength(LOCATIONS);
        const cells = new Set(
            pickups.map(
                (p) =>
                    `${Math.floor((p.col * PICKUP_GRID.cols) / COLS)},${Math.floor((p.row * PICKUP_GRID.rows) / ROWS)}`
            )
        );
        expect(cells.size).toBe(LOCATIONS);
    });

    it('moves a location off mountains and water to the nearest ground hex', () => {
        const water = new Array<Terrain>(COLS * ROWS).fill(TERRAIN.water);
        water[hexIndex(20, 20, COLS)] = TERRAIN.ground; // the only ground hex
        const pickups = generatePickups(water, COLS, ROWS, () => 0);
        expect(pickups).toEqual([expect.objectContaining({ col: 20, row: 20 })]);
    });

    it('is repeatable for a seed', () => {
        const again = (seed: number) => {
            const random = seededRandom(seed);
            const { terrain } = generateTerrain(COLS, ROWS, random);
            return generatePickups(terrain, COLS, ROWS, random);
        };
        expect(again(5)).toEqual(again(5));
    });
});
