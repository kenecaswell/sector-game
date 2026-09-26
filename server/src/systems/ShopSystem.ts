import type { Player } from '../state/GameState';
import { SHOP_ITEMS, isShopItemId, ownsShopItem } from '../types/shared';
import { CharacterSystem } from './CharacterSystem';

/**
 * Buys `itemId` for `player` if it exists, they can afford it, and it would get them something
 * (`ownsShopItem`: not an upgrade they have, not a gun that isn't better than theirs). Deducts the
 * credits and applies what the item gives (see SHOP_ITEMS):
 *  - gun:       replaces the player's gun (basic -> big is an upgrade; never a downgrade).
 *  - ammo:      + that many shots (no cap yet). Buyable without a gun.
 *  - upgrade:   added to `upgrades`, permanently (survives respawns). Armor also adds the extra
 *               health right away, so a hurt player keeps their damage but gains the headroom.
 *  - structure: one more of that type in `structureInventory`; buy as many as you like.
 * Returns whether the purchase happened. Phase and connection checks belong to the caller
 * (GameRoom.handlePurchase).
 */
function purchase(player: Player, itemId: unknown): boolean {
    if (!isShopItemId(itemId)) return false;

    const item = SHOP_ITEMS[itemId];
    if (player.credits < item.cost || ownsShopItem(player, itemId)) return false;

    player.credits -= item.cost;
    if (item.gun) player.gun = item.gun;
    if (item.ammo) player.ammo += item.ammo;
    if (item.structure) player.structureInventory.push(item.structure);
    if (item.upgrade) {
        player.upgrades.push(item.upgrade);
        const before = player.maxHealth;
        CharacterSystem.applyUpgradeEffects(player);
        player.health += player.maxHealth - before;
    }
    return true;
}

export const ShopSystem = { purchase };
