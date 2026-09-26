// The client-side view of shared/types.ts: the rules the lobby and shop UI depend on.
import { describe, expect, it } from 'vitest';
import {
    CHARACTERS,
    CHARACTER_IDS,
    SHOP_ITEMS,
    SHOP_ITEM_IDS,
    TEAMS,
    isShopItemId,
    normalizePlayerName,
    ownsShopItem,
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
    const player = (gun: string, upgrades: string[] = []) => ({ gun, upgrades });

    it('treats any gun as owning the basic gun, and only the big gun as owning it', () => {
        expect(ownsShopItem(player(''), 'basicGun')).toBe(false);
        expect(ownsShopItem(player('basic'), 'basicGun')).toBe(true);
        expect(ownsShopItem(player('big'), 'basicGun')).toBe(true);
        expect(ownsShopItem(player('basic'), 'bigGun')).toBe(false);
        expect(ownsShopItem(player('big'), 'bigGun')).toBe(true);
    });

    it('marks upgrades you have as owned', () => {
        expect(ownsShopItem(player('', ['armor']), 'armor')).toBe(true);
        expect(ownsShopItem(player('', ['armor']), 'boost')).toBe(false);
    });

    it('never marks ammo or structures as owned (you can always buy more)', () => {
        const rich = player('big', ['boost', 'armor', 'expander']);
        for (const id of ['ammo', 'farm', 'mine', 'fort', 'power'] as const) {
            expect(ownsShopItem(rich, id)).toBe(false);
        }
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
