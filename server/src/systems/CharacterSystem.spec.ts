import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, BASE_MAX_HEALTH } from '../constants';
import { Player } from '../state/GameState';
import {
    ARMOR_HEALTH_PER_LEVEL,
    CHARACTERS,
    CHARACTER_IDS,
    DEFAULT_CHARACTER,
    UPGRADE_IDS,
    upgradeLevel,
} from '../types/shared';
import { CharacterSystem } from './CharacterSystem';

describe('CharacterSystem.apply', () => {
    it.each(CHARACTER_IDS)("replaces whatever the player had with the %s's kit", (id) => {
        const player = new Player();
        player.character = id;
        player.materials = 999;
        player.ammo = 999;
        player.gun = 'big';
        player.health = 1;
        player.structureInventory.push('fort', 'fort');
        player.expanderLevel = 3;
        player.armorLevel = 2;
        player.equippedUpgrade = 'expander';
        CharacterSystem.apply(player);
        const kit = CHARACTERS[id];
        expect(player.gun).toBe(kit.gun ?? '');
        expect(player.ammo).toBe(kit.ammo);
        expect(player.materials).toBe(kit.materials);
        expect(Array.from(player.structureInventory)).toEqual(kit.structures);
        for (const upgrade of UPGRADE_IDS) {
            expect(upgradeLevel(player, upgrade), upgrade).toBe(kit.upgrades[upgrade] ?? 0);
        }
        expect(player.equippedUpgrade).toBe(kit.equipped ?? '');
        expect(player.health).toBe(player.maxHealth); // starts at full health
        // The old Armor is gone; only the kit's own counts (the Explorer's, since 2026-09-29).
        expect(player.maxHealth).toBe(
            BASE_MAX_HEALTH + ARMOR_HEALTH_PER_LEVEL * (kit.upgrades.armor ?? 0)
        );
        expect(player.claimRadius).toBe(BASE_CLAIM_RADIUS); // and so is the old Expander
    });

    it('the Explorer starts unarmed, with Armor 1: 200 health', () => {
        const player = new Player();
        player.character = 'explorer';
        CharacterSystem.apply(player);
        expect([player.gun, player.ammo, player.armorLevel]).toEqual(['', 0, 1]);
        expect([player.health, player.maxHealth]).toEqual([200, 200]);
    });

    it('the Robot starts with Booster 1 equipped', () => {
        const robot = new Player();
        robot.character = 'robot';
        CharacterSystem.apply(robot);
        expect([robot.boosterLevel, robot.equippedUpgrade]).toEqual([1, 'booster']);
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
