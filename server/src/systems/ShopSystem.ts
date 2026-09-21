import type { Player } from '../state/GameState';
import { BASE_CLAIM_RADIUS, EXPANDER_CLAIM_RADIUS } from '../constants';
import { AMMO_PACK_SIZE, SHOP_ITEMS, isShopItemId } from '../types/shared';

/**
 * Buys `itemId` for `player` if it exists, they can afford it, and (for one-per-player upgrades)
 * they don't already own it. Deducts the credits and applies the effect. Returns whether the
 * purchase happened. Phase and connection checks belong to the caller (GameRoom.handlePurchase).
 *
 * Effects:
 *  - ammo:     + AMMO_PACK_SIZE shots (no cap yet).
 *  - expander: claim radius becomes EXPANDER_CLAIM_RADIUS, permanently (survives respawns).
 */
function purchase(player: Player, itemId: unknown): boolean {
    if (!isShopItemId(itemId)) return false;

    const item = SHOP_ITEMS[itemId];
    if (player.credits < item.cost) return false;
    if (itemId === 'expander' && player.claimRadius > BASE_CLAIM_RADIUS) return false; // already owned

    player.credits -= item.cost;
    if (itemId === 'ammo') {
        player.ammo += AMMO_PACK_SIZE;
    } else {
        player.claimRadius = EXPANDER_CLAIM_RADIUS;
    }
    return true;
}

export const ShopSystem = { purchase };
