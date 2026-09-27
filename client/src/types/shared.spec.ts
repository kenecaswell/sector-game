// The client-side view of shared/types.ts: the rules the lobby and shop UI depend on.
import { describe, expect, it } from 'vitest';
import {
    CHARACTERS,
    CHARACTER_IDS,
    SHOP_ITEMS,
    SHOP_ITEM_IDS,
    TEAMS,
    isShopItemId,
    activeUpgradeLevel,
    normalizePlayerName,
    ownsShopItem,
    pickupLabel,
    shopItemDescription,
    shopItemTitle,
} from './shared';

describe('normalizePlayerName', () => {
    it('trims, collapses whitespace and strips control characters', () => {
        expect(normalizePlayerName('  Ada   Lovelace ')).toBe('Ada Lovelace');
        expect(normalizePlayerName('a\tb')).toBe('a b');
        expect(normalizePlayerName('x\u0000y')).toBe('xy');
    });

    it('allows 2–25 characters, counting an emoji as one', () => {
        expect(normalizePlayerName('a')).toBeNull();
        expect(normalizePlayerName('ab')).toBe('ab');
        expect(normalizePlayerName('x'.repeat(25))).toBe('x'.repeat(25));
        expect(normalizePlayerName('x'.repeat(26))).toBeNull();
        expect(normalizePlayerName('🚀'.repeat(25))).not.toBeNull();
    });

    it('refuses anything that is not a string', () => {
        for (const value of [undefined, null, 42, {}, ['ab']]) {
            expect(normalizePlayerName(value)).toBeNull();
        }
    });
});

describe('ownsShopItem', () => {
    const player = (gun: string, levels: Partial<Record<string, number>> = {}) => ({
        gun,
        boosterLevel: 0,
        expanderLevel: 0,
        armorLevel: 0,
        wingsLevel: 0,
        equippedUpgrade: '',
        ...levels,
    });

    it('treats any gun as owning the basic gun, and only the big gun as owning it', () => {
        expect(ownsShopItem(player(''), 'basicGun')).toBe(false);
        expect(ownsShopItem(player('basic'), 'basicGun')).toBe(true);
        expect(ownsShopItem(player('big'), 'basicGun')).toBe(true);
        expect(ownsShopItem(player('basic'), 'bigGun')).toBe(false);
        expect(ownsShopItem(player('big'), 'bigGun')).toBe(true);
    });

    it('marks an upgrade owned only at its top level (3, or 1 for Wings)', () => {
        expect(ownsShopItem(player('', { boosterLevel: 2 }), 'booster')).toBe(false);
        expect(ownsShopItem(player('', { boosterLevel: 3 }), 'booster')).toBe(true);
        expect(ownsShopItem(player('', { armorLevel: 3 }), 'armor')).toBe(true);
        expect(ownsShopItem(player('', { wingsLevel: 1 }), 'wings')).toBe(true);
        expect(ownsShopItem(player(''), 'expander')).toBe(false);
    });

    it('never marks ammo or structures as owned (you can always buy more)', () => {
        const rich = player('big', { boosterLevel: 3, armorLevel: 3, expanderLevel: 3 });
        for (const id of ['ammo', 'farm', 'mine', 'fort', 'power'] as const) {
            expect(ownsShopItem(rich, id)).toBe(false);
        }
    });
});

describe('upgrade levels in the shop', () => {
    const none = {
        gun: '',
        boosterLevel: 0,
        expanderLevel: 0,
        armorLevel: 0,
        wingsLevel: 0,
        equippedUpgrade: '',
    };

    it('offers the next level, and describes it', () => {
        expect(shopItemTitle(none, 'booster')).toBe('Booster 1');
        expect(shopItemTitle({ ...none, boosterLevel: 2 }, 'booster')).toBe('Booster 3');
        expect(shopItemDescription({ ...none, boosterLevel: 2 }, 'booster')).toBe(
            '175% of normal speed.'
        );
        expect(shopItemDescription({ ...none, armorLevel: 1 }, 'armor')).toMatch(/^300 max health/);
        expect(shopItemTitle(none, 'wings')).toBe('Wings'); // one level: no number
        expect(shopItemTitle(none, 'ammo')).toBe('Ammo pack');
    });

    it('only the equipped slot upgrade is active; Armor always is', () => {
        const p = {
            ...none,
            boosterLevel: 2,
            expanderLevel: 1,
            armorLevel: 2,
            equippedUpgrade: 'expander',
        };
        expect(activeUpgradeLevel(p, 'booster')).toBe(0);
        expect(activeUpgradeLevel(p, 'expander')).toBe(1);
        expect(activeUpgradeLevel(p, 'armor')).toBe(2);
    });
});

describe('catalogs', () => {
    it('every shop item gives exactly one thing and has a positive price', () => {
        for (const id of SHOP_ITEM_IDS) {
            const item = SHOP_ITEMS[id];
            const gives = [item.gun, item.ammo, item.upgrade, item.structure].filter(
                (value) => value !== undefined
            );
            expect(gives, id).toHaveLength(1);
            expect(item.cost, id).toBeGreaterThan(0);
            expect(item.id).toBe(id);
        }
    });

    it('rejects junk shop ids, including inherited object keys', () => {
        for (const value of ['gun', '', '__proto__', 'toString', null, 42]) {
            expect(isShopItemId(value)).toBe(false);
        }
    });

    it('every character has a name and a non-negative kit', () => {
        for (const id of CHARACTER_IDS) {
            expect(CHARACTERS[id].name.length).toBeGreaterThan(0);
            expect(CHARACTERS[id].ammo).toBeGreaterThanOrEqual(0);
            expect(CHARACTERS[id].credits).toBeGreaterThanOrEqual(0);
        }
    });

    it('team colors are all different', () => {
        const colors = Object.values(TEAMS).map((team) => team.color);
        expect(new Set(colors).size).toBe(colors.length);
    });
});

describe('pickupLabel', () => {
    it('names piles by amount and items like the shop (upgrades at level 1)', () => {
        expect(pickupLabel('credits', '', 30)).toBe('30 credits');
        expect(pickupLabel('ammo', '', 12)).toBe('12 ammo');
        expect(pickupLabel('item', 'booster', 0)).toBe('Booster 1');
        expect(pickupLabel('item', 'wings', 0)).toBe('Wings');
        expect(pickupLabel('item', 'bigGun', 0)).toBe('Big gun');
        expect(pickupLabel('item', 'fort', 0)).toBe('Fort');
    });
});
