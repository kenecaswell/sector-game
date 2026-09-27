import type { GameState, Player } from '../state/GameState';
import { BASE_CLAIM_RADIUS, BASE_MAX_HEALTH, EXPANDER_CLAIM_RADII } from '../constants';
import { pixelToHex } from '../hex';
import { blocksWalkingAt } from '../terrain';
import {
    ARMOR_HEALTH_PER_LEVEL,
    BOOSTER_SPEED_PER_LEVEL,
    UPGRADES,
    UPGRADE_SWITCH_COOLDOWN_MS,
    activeUpgradeLevel,
    isUpgradeId,
    upgradeLevel,
    type UpgradeId,
} from '../types/shared';

/**
 * Upgrades have levels, and a player has one slot: of the slot upgrades (Booster, Expander, Wings)
 * only the equipped one has an effect. Armor always works. See docs/GAME_DESIGN.md → Upgrades.
 */

/**
 * Sets the stats that follow from the player's upgrades: max health (Armor, always on) and claim
 * radius (the Expander, when equipped). Speed and flying need nothing here — MovementSystem asks
 * `speedMultiplier` and `canFly`. Health isn't touched (see ShopSystem for what buying Armor does).
 */
function applyUpgradeEffects(player: Player): void {
    player.maxHealth = BASE_MAX_HEALTH + ARMOR_HEALTH_PER_LEVEL * player.armorLevel;
    const expander = activeUpgradeLevel(player, 'expander');
    player.claimRadius = expander > 0 ? EXPANDER_CLAIM_RADII[expander - 1] : BASE_CLAIM_RADIUS;
}

/** Top speed relative to normal: +BOOSTER_SPEED_PER_LEVEL per level of an equipped Booster. */
function speedMultiplier(player: Player): number {
    return 1 + BOOSTER_SPEED_PER_LEVEL * activeUpgradeLevel(player, 'booster');
}

/** Whether the player flies over mountains and deep water (Wings equipped). */
function canFly(player: Player): boolean {
    return activeUpgradeLevel(player, 'wings') > 0;
}

/**
 * Equips a slot upgrade the player owns, or empties the slot (`''`). Refused outside the match,
 * during the cooldown (UPGRADE_SWITCH_COOLDOWN_MS after the last change), for an upgrade they don't
 * own or one that doesn't use the slot (Armor), when nothing would change, and for taking Wings
 * off while over a mountain or deep water (they'd be stuck inside it). Returns whether it happened.
 */
function equip(state: GameState, player: Player, upgradeId: unknown, now = Date.now()): boolean {
    if (state.phase.phase !== 'playing') return false;
    if (upgradeId !== '' && !isUpgradeId(upgradeId)) return false;
    if (upgradeId !== '' && (!UPGRADES[upgradeId].slot || upgradeLevel(player, upgradeId) === 0)) {
        return false;
    }
    if (upgradeId === player.equippedUpgrade || now < player.upgradeSwitchReadyAt) return false;
    if (canFly(player)) {
        const { col, row } = pixelToHex(player.x, player.y);
        if (blocksWalkingAt(state, col, row)) return false;
    }
    player.equippedUpgrade = upgradeId;
    player.upgradeSwitchReadyAt = now + UPGRADE_SWITCH_COOLDOWN_MS;
    applyUpgradeEffects(player);
    return true;
}

/** Raises an upgrade a level; a slot upgrade bought with the slot empty is equipped at once. */
function levelUp(player: Player, upgradeId: UpgradeId): void {
    const field = `${upgradeId}Level` as const;
    player[field] = Math.min(upgradeLevel(player, upgradeId) + 1, UPGRADES[upgradeId].maxLevel);
    if (UPGRADES[upgradeId].slot && player.equippedUpgrade === '')
        player.equippedUpgrade = upgradeId;
    applyUpgradeEffects(player);
}

export const UpgradeSystem = { applyUpgradeEffects, speedMultiplier, canFly, equip, levelUp };
