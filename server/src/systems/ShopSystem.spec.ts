import { describe, expect, it } from 'vitest';
import { EXPANDER_CLAIM_RADIUS } from '../constants';
import { Player } from '../state/GameState';
import { AMMO_PACK_SIZE, SHOP_ITEMS } from '../types/shared';
import { CharacterSystem } from './CharacterSystem';
import { ShopSystem } from './ShopSystem';

const buyer = (credits = 1000) => Object.assign(new Player(), { credits });

describe('ShopSystem — prices', () => {
    it('guns 100 / 200, upgrades and structures 100, ammo 1 credit per shot', () => {
        expect(SHOP_ITEMS.basicGun.cost).toBe(100);
        expect(SHOP_ITEMS.bigGun.cost).toBe(200);
        for (const id of ['boost', 'armor', 'expander', 'farm', 'mine', 'fort', 'power'] as const) {
            expect(SHOP_ITEMS[id].cost, id).toBe(100);
        }
        expect(SHOP_ITEMS.ammo.cost).toBe(AMMO_PACK_SIZE);
    });

    it("refuses what you can't afford, charging nothing", () => {
        const p = buyer(SHOP_ITEMS.ammo.cost - 1);
        expect(ShopSystem.purchase(p, 'ammo')).toBe(false);
        expect(p.credits).toBe(SHOP_ITEMS.ammo.cost - 1);
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
        expect(p.credits).toBe(1000);
    });
});

describe('ShopSystem — weapons', () => {
    it('ammo adds a pack (even without a gun) and can be bought again', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'ammo')).toBe(true);
        expect(ShopSystem.purchase(p, 'ammo')).toBe(true);
        expect(p.ammo).toBe(2 * AMMO_PACK_SIZE);
        expect(p.credits).toBe(1000 - 2 * SHOP_ITEMS.ammo.cost);
    });

    it('the basic gun arms you, once', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(true);
        expect(p.gun).toBe('basic');
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(false);
        expect(p.credits).toBe(900);
    });

    it("the big gun replaces the basic one, and you can't go back or buy it twice", () => {
        const p = buyer();
        ShopSystem.purchase(p, 'basicGun');
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(true);
        expect(p.gun).toBe('big');
        expect(ShopSystem.purchase(p, 'basicGun')).toBe(false);
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(false);
        expect(p.credits).toBe(700);
    });

    it("the big gun doesn't need the basic one first", () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'bigGun')).toBe(true);
        expect(p.gun).toBe('big');
    });
});

describe('ShopSystem — upgrades', () => {
    it('Armor doubles max health and adds the extra 100 right away', () => {
        const p = buyer();
        p.health = 40;
        expect(ShopSystem.purchase(p, 'armor')).toBe(true);
        expect([p.maxHealth, p.health]).toEqual([200, 140]);
    });

    it('the Expander sets the claim radius; the boost is kept as an upgrade', () => {
        const p = buyer();
        expect(ShopSystem.purchase(p, 'expander')).toBe(true);
        expect(p.claimRadius).toBe(EXPANDER_CLAIM_RADIUS);
        expect(ShopSystem.purchase(p, 'boost')).toBe(true);
        expect(Array.from(p.upgrades)).toEqual(['expander', 'boost']);
    });

    it('every upgrade is one per player', () => {
        const p = buyer();
        for (const id of ['armor', 'boost', 'expander'] as const) ShopSystem.purchase(p, id);
        const credits = p.credits;
        for (const id of ['armor', 'boost', 'expander'] as const) {
            expect(ShopSystem.purchase(p, id), id).toBe(false);
        }
        expect(p.credits).toBe(credits);
    });

    it("a Robot can't buy the boost it starts with", () => {
        const robot = new Player();
        robot.character = 'robot';
        CharacterSystem.apply(robot);
        robot.credits = 1000;
        expect(ShopSystem.purchase(robot, 'boost')).toBe(false);
    });
});

describe('ShopSystem — structures', () => {
    it('adds to the inventory, as many as you can pay for', () => {
        const p = buyer();
        for (const id of ['farm', 'farm', 'mine', 'fort', 'power'] as const) {
            expect(ShopSystem.purchase(p, id)).toBe(true);
        }
        expect(Array.from(p.structureInventory)).toEqual(['farm', 'farm', 'mine', 'fort', 'power']);
        expect(p.credits).toBe(500);
    });
});
