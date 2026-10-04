// What a bot fabricates next, following its difficulty's shopping list (BotProfile.shopPlan).

import type { BotProfile } from '../constants';
import {
    SHOP_ITEMS,
    isGunItem,
    ownsShopItem,
    upgradeLevel,
    type ShopCustomer,
    type ShopItemId,
} from '../types/shared';

/** What a bot's situation calls for before its shopping list does (see `nextPurchase`). */
export interface BotNeeds {
    hasFabricator: boolean; // it owns one, so the Fabricator menu is open to it
    nearTileCap: boolean; // it's within FARM_MARGIN hexes of its tile limit: time to buy a farm
    approachingTileCap: boolean; // within RESERVE_MARGIN: keep a farm's price in hand
    towersFull?: boolean; // at its Guard Tower limit: no more towers to buy
    gunsDisabled?: boolean; // the game has no guns: it skips guns and ammo
}

// At its tile limit a bot can't claim, so it earns no materials, and a bot that has spent
// everything by then can never afford the farm that would lift the limit. So it keeps the price of
// a farm back once it is RESERVE_MARGIN hexes from the limit, and buys the farm at FARM_MARGIN, in
// time to place it while there are still hexes to claim for its footprint.
export const FARM_MARGIN = 150;
export const RESERVE_MARGIN = 250;

/**
 * The item a bot should buy now, or null to wait. Two things come before the shopping list:
 * a Fabricator when it has none (nothing else but structures can be bought without one), and a farm
 * when it's close to its tile limit (and, as it nears the limit, a farm's price is held back from
 * everything else). Then, low on ammo with a gun, ammo comes first. With `gunsDisabled` it skips
 * guns and ammo, and carries on with the rest of its list. Otherwise it's
 * the first entry of `shopPlan` not done yet (an upgrade listed k times is done at level k, a gun
 * once owned, the k-th structure entry once it has bought k plan structures): if it can afford
 * that, that's it; if not, it waits (`saveUp`) or tries the entries after it. With the list done
 * and `keepBuilding`, it's a Guard Tower whenever it has no structure waiting to be placed.
 * Whether the purchase goes through is still up to ShopSystem.
 */
export function nextPurchase(
    player: ShopCustomer & {
        materials: number;
        ammo: number;
        structureInventory: readonly string[];
    },
    profile: Pick<BotProfile, 'ammoLow' | 'shopPlan' | 'saveUp' | 'keepBuilding'>,
    structuresBought: number,
    needs: BotNeeds = { hasFabricator: true, nearTileCap: false, approachingTileCap: false }
): ShopItemId | null {
    const holding = (id: ShopItemId) => player.structureInventory.includes(id);
    // The farm's price stays untouched for everything but the Fabricator and the farm itself.
    const reserve = needs.approachingTileCap && !holding('farm') ? SHOP_ITEMS.farm.cost : 0;
    const affordable = (id: ShopItemId) =>
        player.materials - (id === 'farm' || id === 'fabricator' ? 0 : reserve) >=
        SHOP_ITEMS[id].cost;

    if (!needs.hasFabricator && !holding('fabricator')) {
        if (affordable('fabricator')) return 'fabricator';
        if (profile.saveUp) return null;
    }
    if (needs.nearTileCap && !holding('farm')) {
        if (affordable('farm')) return 'farm';
        if (profile.saveUp) return null;
    }

    // Without a Fabricator only structures can be bought, so skip gear.
    const gearLocked = !needs.hasFabricator;
    if (!needs.gunsDisabled && !gearLocked && player.gun !== '' && player.ammo < profile.ammoLow) {
        if (affordable('ammo')) return 'ammo';
        if (profile.saveUp) return null;
    }

    const upgradesSeen = new Map<string, number>();
    let structuresSeen = 0;
    for (const id of profile.shopPlan) {
        if (needs.gunsDisabled && isGunItem(id)) continue; // not for sale in this game
        const item = SHOP_ITEMS[id];
        let done: boolean;
        if (item.upgrade) {
            const k = (upgradesSeen.get(item.upgrade) ?? 0) + 1;
            upgradesSeen.set(item.upgrade, k);
            done = upgradeLevel(player, item.upgrade) >= k;
        } else if (item.structure) {
            done =
                structuresBought >= ++structuresSeen || (id === 'guardTower' && !!needs.towersFull);
        } else {
            done = ownsShopItem(player, id);
        }
        if (done) continue;
        if (gearLocked && !item.structure) {
            if (profile.saveUp) return null;
            continue;
        }
        if (affordable(id)) return id;
        if (profile.saveUp) return null;
    }
    if (
        profile.keepBuilding &&
        !needs.towersFull &&
        player.structureInventory.length === 0 &&
        affordable('guardTower')
    ) {
        return 'guardTower';
    }
    return null;
}
