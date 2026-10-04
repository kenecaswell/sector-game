import { describe, expect, it } from 'vitest';
import {
    PICKUP_AMMO,
    PICKUP_EMPTY_CHANCE,
    PICKUP_GRID,
    PICKUP_MATERIALS,
    PICKUP_TIER_CHANCES,
    SPAWN_CLEAR_RADIUS,
    type PickupOutcome,
} from './constants';
import { hexDistance, hexIndex } from './hex';
import {
    STRUCTURE_ITEMS,
    generatePickups,
    rollPickup,
    scoreTier,
    type PickupCollector,
} from './pickups';
import { generateTerrain, seededRandom, spawnHexes } from './terrain';
import { SHOP_ITEMS, TERRAIN, UPGRADE_IDS, type Terrain } from './types/shared';

const COLS = 64;
const ROWS = 64;
const LOCATIONS = PICKUP_GRID.cols * PICKUP_GRID.rows;

/** A fresh player: unarmed, no upgrades. */
const fresh = (): PickupCollector => ({
    gun: '',
    boosterLevel: 0,
    expanderLevel: 0,
    armorLevel: 0,
    wingsLevel: 0,
    equippedUpgrade: '',
});

/** What a roll came out as, in PICKUP_TIER_CHANCES terms. */
function outcomeOf(contents: ReturnType<typeof rollPickup>): PickupOutcome {
    if (contents.kind !== 'item') return contents.kind;
    const item = SHOP_ITEMS[contents.itemId as keyof typeof SHOP_ITEMS];
    if (item.upgrade) return 'upgrade';
    if (item.structure) return 'structure';
    return contents.itemId as 'basicGun' | 'bigGun';
}

function shares(tier: number, collector: PickupCollector, n = 20_000) {
    const random = seededRandom(tier + 11);
    const counts: Partial<Record<PickupOutcome, number>> = {};
    for (let i = 0; i < n; i++) {
        const outcome = outcomeOf(rollPickup(tier, collector, random));
        counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return (outcome: PickupOutcome) => (counts[outcome] ?? 0) / n;
}

describe('pickup tier tables', () => {
    it('has four tiers, each adding up to 100%', () => {
        expect(PICKUP_TIER_CHANCES).toHaveLength(4);
        for (const row of PICKUP_TIER_CHANCES) {
            expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(100);
        }
    });

    it('better items get likelier further down the tiers, materials and ammo less likely', () => {
        for (let t = 1; t < PICKUP_TIER_CHANCES.length; t++) {
            const [above, below] = [PICKUP_TIER_CHANCES[t - 1], PICKUP_TIER_CHANCES[t]];
            expect(below.upgrade + below.structure + below.bigGun).toBeGreaterThan(
                above.upgrade + above.structure + above.bigGun
            );
            expect(below.materials + below.ammo).toBeLessThan(above.materials + above.ammo);
        }
    });
});

describe('rollPickup', () => {
    it("comes out in about each tier's proportions for a fresh player, amounts in range", () => {
        PICKUP_TIER_CHANCES.forEach((row, tier) => {
            const share = shares(tier, fresh());
            for (const [outcome, percent] of Object.entries(row) as [PickupOutcome, number][]) {
                expect(share(outcome), `tier ${tier + 1} ${outcome}`).toBeCloseTo(percent / 100, 1);
            }
        });
        const random = seededRandom(5);
        for (let i = 0; i < 2000; i++) {
            const contents = rollPickup(3, fresh(), random);
            const range = contents.kind === 'materials' ? PICKUP_MATERIALS : PICKUP_AMMO;
            if (contents.kind === 'item') continue;
            expect(contents.amount).toBeGreaterThanOrEqual(range.min);
            expect(contents.amount).toBeLessThanOrEqual(range.max);
        }
    });

    it("never gives something you can't use; the rest of the row shares its chance", () => {
        const armed: PickupCollector = { ...fresh(), gun: 'big' };
        for (const id of UPGRADE_IDS) armed[`${id}Level`] = 1;
        const share = shares(3, armed);
        expect(share('basicGun') + share('bigGun') + share('upgrade')).toBe(0);
        const row = PICKUP_TIER_CHANCES[3];
        const left = row.materials + row.ammo + row.structure;
        expect(share('structure')).toBeCloseTo(row.structure / left, 1);
    });

    it('an upgrade is level 1 of one you lack; a blaster only if unarmed', () => {
        const collector: PickupCollector = { ...fresh(), gun: 'basic', boosterLevel: 1 };
        const random = seededRandom(9);
        for (let i = 0; i < 3000; i++) {
            const contents = rollPickup(3, collector, random);
            expect(contents.itemId).not.toBe('basicGun');
            expect(contents.itemId).not.toBe('booster');
        }
    });
});

describe('rollPickup with guns disabled', () => {
    it('never rolls ammo or a gun, and the rest of the row shares their chance', () => {
        for (let tier = 0; tier < 4; tier++) {
            for (let step = 0; step < 200; step++) {
                const roll = rollPickup(tier, fresh(), () => step / 200, undefined, false);
                expect(roll.kind, `tier ${tier} roll ${step}`).not.toBe('ammo');
                expect(['basicGun', 'bigGun']).not.toContain(roll.itemId);
            }
        }
    });

    it('still rolls guns and ammo when enabled', () => {
        const kinds = new Set<string>();
        for (let step = 0; step < 200; step++) {
            const roll = rollPickup(3, fresh(), () => step / 200);
            kinds.add(roll.kind === 'ammo' ? 'ammo' : roll.itemId);
        }
        expect(kinds).toContain('ammo');
        expect(kinds).toContain('basicGun');
    });
});

describe('structures from a pod', () => {
    it('are any of the four by default, and never a type left out of the list given', () => {
        const random = seededRandom(5);
        const seen = new Set<string>();
        for (let i = 0; i < 6000; i++) {
            const c = rollPickup(3, fresh(), random);
            if (
                c.kind === 'item' &&
                ['farm', 'fabricator', 'guardTower', 'power'].includes(c.itemId)
            )
                seen.add(c.itemId);
        }
        expect(seen.size).toBe(4);

        const noTowers = STRUCTURE_ITEMS.filter((type) => type !== 'guardTower');
        for (let i = 0; i < 6000; i++) {
            expect(rollPickup(3, fresh(), random, noTowers).itemId).not.toBe('guardTower');
        }
    });
});

describe('scoreTier', () => {
    it('leader 1, last 4, in between spread out (as indexes 0-3)', () => {
        const scores = [100, 80, 60, 40];
        expect(scores.map((s) => scoreTier(scores, s))).toEqual([0, 1, 2, 3]);
        const two = [50, 10];
        expect(two.map((s) => scoreTier(two, s))).toEqual([0, 3]);
        const ten = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
        expect(ten.map((s) => scoreTier(ten, s))).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
    });

    it('ties share the average place: everyone level sits in the middle, alone is the leader', () => {
        expect(scoreTier([0, 0, 0, 0], 0)).toBe(2); // place 1.5 of 0-3 rounds to the third tier
        expect(scoreTier([5], 5)).toBe(0);
        expect(scoreTier([90, 90, 10], 90)).toBe(1); // tied for first: place 0.5 of 0-2
        expect(scoreTier([90, 90, 10], 10)).toBe(3);
    });
});

describe('pickup placement', () => {
    const maps = Array.from({ length: 30 }, (_, seed) => {
        const random = seededRandom(seed + 1);
        const { terrain } = generateTerrain(COLS, ROWS, random);
        return { terrain, pickups: generatePickups(terrain, COLS, ROWS, random) };
    });

    it('places up to one per grid cell, on distinct ground hexes outside the spawn areas', () => {
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
        // PICKUP_EMPTY_CHANCE (5%) of locations get no pod.
        const placed = maps.reduce((n, m) => n + m.pickups.length, 0) / (maps.length * LOCATIONS);
        expect(placed).toBeGreaterThan(0.88);
        expect(placed).toBeLessThan(1);
    });

    it('leaves a location empty when its roll is under PICKUP_EMPTY_CHANCE', () => {
        const all = new Array<Terrain>(COLS * ROWS).fill(TERRAIN.ground);
        expect(generatePickups(all, COLS, ROWS, () => (PICKUP_EMPTY_CHANCE - 0.1) / 100)).toEqual(
            []
        );
        expect(generatePickups(all, COLS, ROWS, () => PICKUP_EMPTY_CHANCE / 100)).toHaveLength(
            LOCATIONS
        );
    });

    it('fills only the cells asked for, avoiding blocked hexes, and says which cell each is in', () => {
        const all = new Array<Terrain>(COLS * ROWS).fill(TERRAIN.ground);
        const free = generatePickups(all, COLS, ROWS, () => 0.5, { cells: [0, 5] });
        expect(free.map((p) => p.cell)).toEqual([0, 5]);
        const moved = generatePickups(all, COLS, ROWS, () => 0.5, {
            cells: [0],
            blocked: (h) => h.col === free[0].col && h.row === free[0].row,
        });
        expect(moved).toHaveLength(1);
        expect([moved[0].col, moved[0].row]).not.toEqual([free[0].col, free[0].row]);
        expect(hexDistance(moved[0], free[0])).toBe(1);
    });

    it('spreads them evenly: one near the middle of each grid cell', () => {
        const all = new Array<Terrain>(COLS * ROWS).fill(TERRAIN.ground);
        const pickups = generatePickups(all, COLS, ROWS, () => 0.5);
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
        const pickups = generatePickups(water, COLS, ROWS, () => 0.5);
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
