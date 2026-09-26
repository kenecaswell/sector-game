import type { Player } from '../state/GameState';
import { CHARACTERS, DEFAULT_CHARACTER, isCharacterId } from '../types/shared';

/**
 * Gives `player` their character's starting kit (CHARACTERS in types/shared.ts): gun, ammo,
 * credits, structure inventory and upgrades, replacing whatever they had. Called for everyone
 * when the countdown finishes, and for anyone who joins mid-match.
 */
function apply(player: Player): void {
    const character =
        CHARACTERS[isCharacterId(player.character) ? player.character : DEFAULT_CHARACTER];
    player.gun = character.gun ?? '';
    player.ammo = character.ammo;
    player.credits = character.credits;
    player.structureInventory.clear();
    player.structureInventory.push(...character.structures);
    player.upgrades.clear();
    player.upgrades.push(...character.upgrades);
}

export const CharacterSystem = { apply };
