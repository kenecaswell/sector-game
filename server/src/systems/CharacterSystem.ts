import type { Player } from '../state/GameState';
import { CHARACTERS, DEFAULT_CHARACTER, UPGRADE_IDS, isCharacterId } from '../types/shared';
import { UpgradeSystem } from './UpgradeSystem';

/**
 * Gives `player` their character's starting kit (CHARACTERS in types/shared.ts): gun, ammo,
 * materials, structure inventory, upgrade levels and the equipped upgrade, replacing whatever they
 * had, and starts them at full health. Called for everyone when the countdown finishes, and for
 * anyone who joins mid-match.
 */
function apply(player: Player): void {
    const character =
        CHARACTERS[isCharacterId(player.character) ? player.character : DEFAULT_CHARACTER];
    player.gun = character.gun ?? '';
    player.ammo = character.ammo;
    player.materials = character.materials;
    player.structureInventory.clear();
    player.structureInventory.push(...character.structures);
    for (const id of UPGRADE_IDS) player[`${id}Level`] = character.upgrades[id] ?? 0;
    player.equippedUpgrade = character.equipped ?? '';
    UpgradeSystem.applyUpgradeEffects(player);
    player.health = player.maxHealth;
}

export const CharacterSystem = { apply };
