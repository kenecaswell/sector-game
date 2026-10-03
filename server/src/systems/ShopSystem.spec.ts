import { describe, expect, it } from 'vitest';
import { EXPANDER_CLAIM_RADII } from '../constants';
import { Player } from '../state/GameState';
import { AMMO_PACK_SIZE, SHOP_ITEMS } from '../types/shared';
import { CharacterSystem } from './CharacterSystem';
import { ShopSystem } from './ShopSystem';

const buyer = (materials = 1000) => Object.assign(new Player(), { materials });

describe('ShopSystem — prices', () => {
    it('weapons cost double: guns 200 / 400, ammo 2 materials a shot; upgrades and structures 100', () => {
        expect(SHOP_ITEMS.basicGun.cost).toBe(200);
        expect(SHOP_ITEMS.bigGun.cost).toBe(400);
        for (const id of [
            'booster',
            'armor',
            'expander',
            'farm',
            'fabricator',
            'guardTower',
            'power',
        ] as const) {
            expect(SHOP_ITEMS[id].cost, id).toBe(100);
        }
        expect(SHOP_ITEMS.wings.cost).toBe(200); // the Jetpack (also Booster 1's speed)
        expect(SHOP_ITEMS.wings.name).toBe('Jetpack');
        expect(SHOP_ITEMS.expander.name).toBe('Harvester');
        expect(SHOP_ITEMS.ammo.cost).toBe(AMMO_PACK_SIZE * 2);
    });

    it("refuses what you can't afford, charging nothing", () => {
        const p = buyer(SHOP_ITEMS.ammo.cost - 1);
        expect(ShopSystem.purchase(p, 'ammo')).toBe(false);
        expect(p.materials).toBe(SHOP_ITEMS.ammo.cost - 1);
    });

    it('refuses junk item ids, including inherited object keys', () => {
        const p = buyer();
        for (const id of [
            'gun',
            '',
            null,
            undefined,
            42,
            {},
            '__proto__',
            'toString',
            'constructor',
        ]) {
            expect(ShopSystem.purchase(p, id)).toBe(false);
        }
        expect(p.materials).toBe(1000);
    });
});

describe('ShopSystem — the Fabricator gate', () => {
    it('without a Fabricator, guns, ammo and upgrades are refused and cost nothing', () => {
        const p = buyer();
        for (const id of ['basicGun', 'bigGun', 'ammo', 'armor', 'booster', 'expander', 'wings']) {
            expect(ShopSystem.purchase(p, id, false), id).toBe(false);
        }
        expect(p.materials).toBe(1000);
        expect(p.gun).toBe('');
    });

    it('structures can still be bought without one (so the first Fabricator can be)', () => {
        const p = buyer();
        for (const id of ['fabricator', 'farm', 'guardTower', 'power']) {
            expect(ShopSystem.purchase(p, id, false), id).toBe(true);
        }
        expect(p.materials).toBe(600);
        expect(Array.from(p.structureInventory)).toEqual([
            'fabricator',
            'farm',
            'guardTower',
            'power',
        ]);
    });

    it('with one, everything is open', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'basicGun', true)).toBe(true);
        expect(ShopSystem.purchase(p, 'armor', true)).toBe(true);
    });
});

describe('ShopSystem — weapons', () => {
    it('ammo adds a pack (even without a gun) and can be bought again', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'ammo')).toBe(true);
        expect(ShopSystem.purchase(p, 'ammo')).toBe(true);
        expect(p.ammo).toBe(2 * AMMO_PACK_SIZE);
        expect(p.materials).toBe(1000 - 2 * SHOP_ITEMS.ammo.cost);
    });

    it('the blaster arms you, once', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(true);
        expect(p.gun).toBe('basic');
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(false);
        expect(p.materials).toBe(800);
    });

    it("the Ion Cannon replaces the Blaster, and you can't go back or buy it twice", () => {
        const p = buyer();
        ShopSystem.purchase(p, 'basicGun');
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(true);
        expect(p.gun).toBe('big');
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(false);
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(false);
        expect(p.materials).toBe(400);
    });

    it("the Ion Cannon doesn't need the Blaster first", () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(true);
        expect(p.gun).toBe('big');
    });
});

describe('ShopSystem — upgrades', () => {
    it('Armor is always on: +100 max health per level (200 / 300 / 400), added right away', () => {
        const p = buyer();
        p.health = 40;
        expect(ShopSystem.purchase(p, 'armor')).toBe(true);
        expect([p.armorLevel, p.maxHealth, p.health]).toEqual([1, 200, 140]);
        ShopSystem.purchase(p, 'armor');
        ShopSystem.purchase(p, 'armor');
        expect([p.armorLevel, p.maxHealth, p.health]).toEqual([3, 400, 340]);
        expect(p.equippedUpgrade).toBe(''); // Armor never takes the slot
    });

    it('Booster and Harvester go up a level at a time, to 3, at 100 materials a level', () => {
        const p = buyer();
        for (const level of [1, 2, 3]) {
            expect(ShopSystem.purchase(p, 'booster')).toBe(true);
            expect(p.boosterLevel).toBe(level);
        }
        expect(ShopSystem.purchase(p, 'booster')).toBe(false); // maxed
        for (let i = 0; i < 3; i++) ShopSystem.purchase(p, 'expander');
        expect(p.expanderLevel).toBe(3);
        expect(ShopSystem.purchase(p, 'expander')).toBe(false);
        expect(p.materials).toBe(1000 - 6 * 100);
    });

    it('Jetpack has one level', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'wings')).toBe(true);
        expect(ShopSystem.purchase(p, 'wings')).toBe(false);
        expect(p.wingsLevel).toBe(1);
        expect(p.materials).toBe(1000 - 200);
    });

    it('the first slot upgrade you buy is equipped; later ones wait in the inventory', () => {
        const p = buyer();
        ShopSystem.purchase(p, 'expander');
        expect(p.equippedUpgrade).toBe('expander');
        expect(p.claimRadius).toBe(EXPANDER_CLAIM_RADII[0]);
        ShopSystem.purchase(p, 'booster');
        expect(p.equippedUpgrade).toBe('expander'); // unchanged
        expect(p.boosterLevel).toBe(1);
    });

    it('buying the next level of the equipped upgrade takes effect at once', () => {
        const p = buyer();
        ShopSystem.purchase(p, 'expander');
        ShopSystem.purchase(p, 'expander');
        expect(p.claimRadius).toBe(EXPANDER_CLAIM_RADII[1]);
    });

    it('a Robot can buy Booster 2 and 3 on top of the Booster 1 it starts with', () => {
        const robot = new Player();
        robot.character = 'robot';
        CharacterSystem.apply(robot);
        robot.materials = 1000;
        expect(ShopSystem.purchase(robot, 'booster')).toBe(true);
        expect(ShopSystem.purchase(robot, 'booster')).toBe(true);
        expect(ShopSystem.purchase(robot, 'booster')).toBe(false);
        expect(robot.boosterLevel).toBe(3);
    });
});

describe('ShopSystem — structures', () => {
    it('adds to the inventory, as many as you can pay for', () => {
        const p = buyer();
        for (const id of ['farm', 'farm', 'fabricator', 'guardTower', 'power'] as const) {
            expect(ShopSystem.purchase(p, id)).toBe(true);
        }
        expect(Array.from(p.structureInventory)).toEqual([
            'farm',
            'farm',
            'fabricator',
            'guardTower',
            'power',
        ]);
        expect(p.materials).toBe(500);
    });
});
