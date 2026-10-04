import { describe, expect, it } from 'vitest';
import type { ShopItemId } from '../types/shared';
import { nextPurchase } from './shopping';

const buyer = (overrides = {}) => ({
    gun: '',
    ammo: 0,
    materials: 0,
    structureInventory: [] as string[],
    boosterLevel: 0,
    expanderLevel: 0,
    armorLevel: 0,
    wingsLevel: 0,
    equippedUpgrade: '',
    ...overrides,
});

const plan = (shopPlan: ShopItemId[], saveUp = true, keepBuilding = false) => ({
    ammoLow: 10,
    shopPlan,
    saveUp,
    keepBuilding,
});

describe('nextPurchase — Fabricator and farms', () => {
    const noFabricator = {
        hasFabricator: false,
        nearTileCap: false,
        approachingTileCap: false,
    };

    it("buys a Fabricator first when it has none, and won't buy gear until it has one", () => {
        const list = plan(['basicGun', 'armor'], false);
        expect(nextPurchase(buyer({ materials: 300 }), list, 0, noFabricator)).toBe('fabricator');
        const holding = buyer({ materials: 300, structureInventory: ['fabricator'] });
        expect(nextPurchase(holding, list, 0, noFabricator)).toBeNull(); // gear is locked
        expect(nextPurchase(holding, list, 0)).toBe('basicGun'); // placed: gear is open
    });

    it('saves up for the Fabricator rather than buying a Guard Tower first', () => {
        const list = plan(['guardTower'], true);
        expect(nextPurchase(buyer({ materials: 99 }), list, 0, noFabricator)).toBeNull();
    });

    it('buys a farm when near its tile limit, unless it is already holding one', () => {
        const list = plan(['basicGun'], true);
        const near = { hasFabricator: true, nearTileCap: true, approachingTileCap: true };
        expect(nextPurchase(buyer({ materials: 100 }), list, 0, near)).toBe('farm');
        expect(
            nextPurchase(buyer({ materials: 100, structureInventory: ['farm'] }), list, 0, near)
        ).toBeNull();
        expect(nextPurchase(buyer({ materials: 99 }), list, 0, near)).toBeNull();
    });
});

describe("nextPurchase — keeping a farm's price back near the tile limit", () => {
    const approaching = { hasFabricator: true, nearTileCap: false, approachingTileCap: true };

    it("won't spend what would leave less than a farm's price", () => {
        const list = plan(['expander'], false);
        expect(nextPurchase(buyer({ materials: 199 }), list, 0, approaching)).toBeNull();
        expect(nextPurchase(buyer({ materials: 200 }), list, 0, approaching)).toBe('expander');
        expect(nextPurchase(buyer({ materials: 100 }), list, 0)).toBe('expander'); // far from the limit
    });

    it('holding a farm already, it spends freely again', () => {
        const list = plan(['expander'], false);
        const held = buyer({ materials: 100, structureInventory: ['farm'] });
        expect(nextPurchase(held, list, 0, approaching)).toBe('expander');
    });

    it('still buys the Fabricator it needs', () => {
        const none = { hasFabricator: false, nearTileCap: false, approachingTileCap: true };
        expect(nextPurchase(buyer({ materials: 100 }), plan([], false), 0, none)).toBe(
            'fabricator'
        );
    });
});

describe('nextPurchase — at the Guard Tower limit', () => {
    const full = {
        hasFabricator: true,
        nearTileCap: false,
        approachingTileCap: false,
        towersFull: true,
    };

    it('skips the towers on its list and goes on to the next item', () => {
        const list = plan(['guardTower', 'armor'], true);
        expect(nextPurchase(buyer({ materials: 100 }), list, 0)).toBe('guardTower');
        expect(nextPurchase(buyer({ materials: 100 }), list, 0, full)).toBe('armor');
    });

    it('does not keep building towers once the list is done', () => {
        const list = plan([], true, true);
        expect(nextPurchase(buyer({ materials: 500 }), list, 0)).toBe('guardTower');
        expect(nextPurchase(buyer({ materials: 500 }), list, 0, full)).toBeNull();
    });
});

describe('nextPurchase', () => {
    it('follows the list in order, skipping what it already has', () => {
        const list = plan(['basicGun', 'expander', 'expander', 'guardTower']);
        expect(nextPurchase(buyer({ materials: 200 }), list, 0)).toBe('basicGun'); // guns cost 200
        expect(nextPurchase(buyer({ materials: 100, gun: 'basic', ammo: 30 }), list, 0)).toBe(
            'expander'
        );
        const levelOne = buyer({ materials: 100, gun: 'big', ammo: 30, expanderLevel: 1 });
        expect(nextPurchase(levelOne, list, 0)).toBe('expander'); // level 2 is listed too
        const levelTwo = { ...levelOne, expanderLevel: 2 };
        expect(nextPurchase(levelTwo, list, 0)).toBe('guardTower');
        expect(nextPurchase(levelTwo, list, 1)).toBeNull(); // the one tower is bought: done
    });

    it('with a gun and little ammo, buys ammo first', () => {
        const list = plan(['expander']);
        expect(nextPurchase(buyer({ materials: 100, gun: 'basic', ammo: 3 }), list, 0)).toBe(
            'ammo'
        );
        expect(nextPurchase(buyer({ materials: 100, gun: '', ammo: 0 }), list, 0)).toBe('expander');
    });

    it('with guns disabled it skips guns and ammo and carries on down its list', () => {
        const off = {
            hasFabricator: true,
            nearTileCap: false,
            approachingTileCap: false,
            gunsDisabled: true,
        };
        const list = plan(['basicGun', 'armor']);
        expect(nextPurchase(buyer({ materials: 200 }), list, 0, off)).toBe('armor');
        const armed = buyer({ materials: 100, gun: 'basic', ammo: 0 }); // would normally want ammo
        expect(nextPurchase(armed, plan(['armor']), 0, off)).toBe('armor');
        expect(nextPurchase(armed, plan(['armor']), 0)).toBe('ammo');
        // Saving up for a gun it can't buy would wait forever.
        expect(nextPurchase(buyer({ materials: 0 }), plan(['bigGun']), 0, off)).toBeNull();
    });

    it('saving up, it waits for the next item; otherwise it takes something further down', () => {
        const rich = buyer({ materials: 100 });
        expect(nextPurchase(rich, plan(['bigGun', 'armor'], true), 0)).toBeNull();
        expect(nextPurchase(rich, plan(['bigGun', 'armor'], false), 0)).toBe('armor');
    });

    it('keeps building once the list is done, one structure at a time', () => {
        const list = plan([], true, true);
        expect(nextPurchase(buyer({ materials: 100 }), list, 0)).toBe('guardTower');
        expect(
            nextPurchase(buyer({ materials: 100, structureInventory: ['guardTower'] }), list, 0)
        ).toBeNull();
        expect(nextPurchase(buyer({ materials: 99 }), list, 0)).toBeNull();
    });
});
