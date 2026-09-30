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

describe('nextPurchase', () => {
    it('follows the list in order, skipping what it already has', () => {
        const list = plan(['basicGun', 'expander', 'expander', 'fort']);
        expect(nextPurchase(buyer({ materials: 200 }), list, 0)).toBe('basicGun'); // guns cost 200
        expect(nextPurchase(buyer({ materials: 100, gun: 'basic', ammo: 30 }), list, 0)).toBe(
            'expander'
        );
        const levelOne = buyer({ materials: 100, gun: 'big', ammo: 30, expanderLevel: 1 });
        expect(nextPurchase(levelOne, list, 0)).toBe('expander'); // level 2 is listed too
        const levelTwo = { ...levelOne, expanderLevel: 2 };
        expect(nextPurchase(levelTwo, list, 0)).toBe('fort');
        expect(nextPurchase(levelTwo, list, 1)).toBeNull(); // the one fort is bought: done
    });

    it('with a gun and little ammo, buys ammo first', () => {
        const list = plan(['expander']);
        expect(nextPurchase(buyer({ materials: 100, gun: 'basic', ammo: 3 }), list, 0)).toBe(
            'ammo'
        );
        expect(nextPurchase(buyer({ materials: 100, gun: '', ammo: 0 }), list, 0)).toBe('expander');
    });

    it('saving up, it waits for the next item; otherwise it takes something further down', () => {
        const rich = buyer({ materials: 100 });
        expect(nextPurchase(rich, plan(['bigGun', 'armor'], true), 0)).toBeNull();
        expect(nextPurchase(rich, plan(['bigGun', 'armor'], false), 0)).toBe('armor');
    });

    it('keeps building once the list is done, one structure at a time', () => {
        const list = plan([], true, true);
        expect(nextPurchase(buyer({ materials: 100 }), list, 0)).toBe('fort');
        expect(
            nextPurchase(buyer({ materials: 100, structureInventory: ['fort'] }), list, 0)
        ).toBeNull();
        expect(nextPurchase(buyer({ materials: 99 }), list, 0)).toBeNull();
    });
});
