import type { Player } from '../state/GameState';
import {
    ARMOR_MAX_HEALTH,
    BASE_CLAIM_RADIUS,
    BASE_MAX_HEALTH,
    EXPANDER_CLAIM_RADIUS,
} from '../constants';
import { CHARACTERS, DEFAULT_CHARACTER, isCharacterId } from '../types/shared';

/**
 * Gives `player` their character's starting kit (CHARACTERS in types/shared.ts): gun, ammo,
 * credits, structure inventory and upgrades, replacing whatever they had, and starts them at
 * full health. Called for everyone when the countdown finishes, and for anyone who joins mid-match.
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
    applyUpgradeEffects(player);
    player.health = player.maxHealth;
}

/**
 * Sets the stats that follow from the player's upgrades: max health (Armor) and claim radius
 * (Expander). Speed boost needs nothing here — MovementSystem reads `upgrades` directly. Health
 * isn't touched (see ShopSystem for what buying Armor does to it).
 */
function applyUpgradeEffects(player: Player): void {
    player.maxHealth = player.upgrades.includes('armor') ? ARMOR_MAX_HEALTH : BASE_MAX_HEALTH;
    player.claimRadius = player.upgrades.includes('expander')
        ? EXPANDER_CLAIM_RADIUS
        : BASE_CLAIM_RADIUS;
}

export const CharacterSystem = { apply, applyUpgradeEffects };
