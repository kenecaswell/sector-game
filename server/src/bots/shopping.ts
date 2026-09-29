// What a bot fabricates next, following its difficulty's shopping list (BotProfile.shopPlan).

import type { BotProfile } from '../constants';
import {
    SHOP_ITEMS,
    ownsShopItem,
    upgradeLevel,
    type ShopCustomer,
    type ShopItemId,
} from '../types/shared';

/**
 * The item a bot should fabricate now, or null to wait. Low on ammo with a gun, ammo comes first.
 * Otherwise it's the first entry of `shopPlan` not done yet (an upgrade listed k times is done at
 * level k, a gun once owned, the k-th structure entry once it has fabricated k structures): if it
 * can afford that, that's it; if not, it waits (`saveUp`) or tries the entries after it. With the
 * list done and `keepBuilding`, it's a fort whenever it has no structure waiting to be placed.
 * Whether the purchase goes through is still up to ShopSystem.
 */
export function nextPurchase(
    player: ShopCustomer & {
        materials: number;
        ammo: number;
        structureInventory: readonly string[];
    },
    profile: Pick<BotProfile, 'ammoLow' | 'shopPlan' | 'saveUp' | 'keepBuilding'>,
    structuresBought: number
): ShopItemId | null {
    const affordable = (id: ShopItemId) => player.materials >= SHOP_ITEMS[id].cost;
    if (player.gun !== '' && player.ammo < profile.ammoLow) {
        if (affordable('ammo')) return 'ammo';
        if (profile.saveUp) return null;
    }

    const upgradesSeen = new Map<string, number>();
    let structuresSeen = 0;
    for (const id of profile.shopPlan) {
        const item = SHOP_ITEMS[id];
        let done: boolean;
        if (item.upgrade) {
            const k = (upgradesSeen.get(item.upgrade) ?? 0) + 1;
            upgradesSeen.set(item.upgrade, k);
            done = upgradeLevel(player, item.upgrade) >= k;
        } else if (item.structure) {
            done = structuresBought >= ++structuresSeen;
        } else {
            done = ownsShopItem(player, id);
        }
        if (done) continue;
        if (affordable(id)) return id;
        if (profile.saveUp) return null;
    }
    if (profile.keepBuilding && player.structureInventory.length === 0 && affordable('fort')) {
        return 'fort';
    }
    return null;
}
