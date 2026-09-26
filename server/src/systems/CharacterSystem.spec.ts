import { describe, expect, it } from 'vitest';
import {
    ARMOR_MAX_HEALTH,
    BASE_CLAIM_RADIUS,
    BASE_MAX_HEALTH,
    EXPANDER_CLAIM_RADIUS,
} from '../constants';
import { Player } from '../state/GameState';
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER } from '../types/shared';
import { CharacterSystem } from './CharacterSystem';

describe('CharacterSystem.apply', () => {
    it.each(CHARACTER_IDS)("replaces whatever the player had with the %s's kit", (id) => {
        const player = new Player();
        player.character = id;
        player.credits = 999;
        player.ammo = 999;
        player.gun = 'big';
        player.health = 1;
        player.structureInventory.push('fort', 'fort');
        player.upgrades.push('expander');
        CharacterSystem.apply(player);
        const kit = CHARACTERS[id];
        expect(player.gun).toBe(kit.gun ?? '');
        expect(player.ammo).toBe(kit.ammo);
        expect(player.credits).toBe(kit.credits);
        expect(Array.from(player.structureInventory)).toEqual(kit.structures);
        expect(Array.from(player.upgrades)).toEqual(kit.upgrades);
        expect(player.health).toBe(player.maxHealth); // starts at full health
        expect(player.claimRadius).toBe(BASE_CLAIM_RADIUS); // the old Expander is gone
    });

    it('falls back to the default kit for an unknown character', () => {
        const player = new Player();
        player.character = 'nonsense';
        CharacterSystem.apply(player);
        expect(Array.from(player.structureInventory)).toEqual(
            CHARACTERS[DEFAULT_CHARACTER].structures
        );
    });
});

describe('CharacterSystem.applyUpgradeEffects', () => {
    it('derives max health from Armor and claim radius from the Expander', () => {
        const player = new Player();
        CharacterSystem.applyUpgradeEffects(player);
        expect([player.maxHealth, player.claimRadius]).toEqual([
            BASE_MAX_HEALTH,
            BASE_CLAIM_RADIUS,
        ]);
        player.upgrades.push('armor', 'expander');
        CharacterSystem.applyUpgradeEffects(player);
        expect([player.maxHealth, player.claimRadius]).toEqual([
            ARMOR_MAX_HEALTH,
            EXPANDER_CLAIM_RADIUS,
        ]);
    });

    it("doesn't touch current health", () => {
        const player = new Player();
        player.health = 30;
        player.upgrades.push('armor');
        CharacterSystem.applyUpgradeEffects(player);
        expect(player.health).toBe(30);
    });
});
