import type { Player } from '../state/GameState';
import { SHOP_ITEMS, isShopItemId, ownsShopItem, type ShopItemId } from '../types/shared';
import { UpgradeSystem } from './UpgradeSystem';

/**
 * Buys `itemId` for `player` if it exists, they can afford it, and it would get them something
 * (`ownsShopItem`: not an upgrade already at its top level, not a gun that isn't better than theirs). Deducts the
 * materials and applies what the item gives (see SHOP_ITEMS):
 *  - gun:       replaces the player's gun (basic -> big is an upgrade; never a downgrade).
 *  - ammo:      + that many shots (no cap yet). Buyable without a gun.
 *  - upgrade:   up a level (permanently; survives respawns). A slot upgrade bought with the slot
 *               empty is equipped at once. Armor also adds the extra health right away, so a hurt
 *               player keeps their damage but gains the headroom.
 *  - structure: one more of that type in `structureInventory`; buy as many as you like.
 * Returns whether the purchase happened. Phase and connection checks belong to the caller
 * (GameRoom.handlePurchase).
 */
function purchase(player: Player, itemId: unknown): boolean {
    if (!isShopItemId(itemId)) return false;

    const item = SHOP_ITEMS[itemId];
    if (player.materials < item.cost || ownsShopItem(player, itemId)) return false;

    player.materials -= item.cost;
    grant(player, itemId);
    return true;
}

/**
 * Gives `player` what the item gives, free and without checks (the caller decides whether they may
 * have it). Used by `purchase` and by pickups (PickupSystem).
 */
function grant(player: Player, itemId: ShopItemId): void {
    const item = SHOP_ITEMS[itemId];
    if (item.gun) player.gun = item.gun;
    if (item.ammo) player.ammo += item.ammo;
    if (item.structure) player.structureInventory.push(item.structure);
    if (item.upgrade) {
        const before = player.maxHealth;
        UpgradeSystem.levelUp(player, item.upgrade);
        player.health += player.maxHealth - before;
    }
}

export const ShopSystem = { purchase, grant };
