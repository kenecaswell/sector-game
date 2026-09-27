import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS } from '../constants';
import { Player } from '../state/GameState';
import {
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
        player.credits = 999;
        player.ammo = 999;
        player.gun = 'big';
        player.health = 1;
        player.structureInventory.push('fort', 'fort');
        player.expanderLevel = 3;
        player.armorLevel = 2;
        player.equippedUpgrade = 'expander';
        player.upgradeSwitchReadyAt = Date.now() + 99999;
        CharacterSystem.apply(player);
        const kit = CHARACTERS[id];
        expect(player.gun).toBe(kit.gun ?? '');
        expect(player.ammo).toBe(kit.ammo);
        expect(player.credits).toBe(kit.credits);
        expect(Array.from(player.structureInventory)).toEqual(kit.structures);
        for (const upgrade of UPGRADE_IDS) {
            expect(upgradeLevel(player, upgrade), upgrade).toBe(kit.upgrades[upgrade] ?? 0);
        }
        expect(player.equippedUpgrade).toBe(kit.equipped ?? '');
        expect(player.upgradeSwitchReadyAt).toBe(0); // free to switch straight away
        expect(player.health).toBe(player.maxHealth); // starts at full health
        expect(player.maxHealth).toBe(100); // the old Armor is gone
        expect(player.claimRadius).toBe(BASE_CLAIM_RADIUS); // and so is the old Expander
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
