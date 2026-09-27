import type { GameState, Player, Pickup } from '../state/GameState';
import { pixelToHex } from '../hex';
import {
    SHOP_ITEMS,
    isShopItemId,
    ownsShopItem,
    upgradeLevel,
    type PickupCollectedEvent,
    type PickupKind,
} from '../types/shared';
import { ShopSystem } from './ShopSystem';
import type { Broadcast } from './Broadcast';

/**
 * Whether `player` can take this pickup. Materials, ammo and structures always; a gun only if it's
 * better than theirs (the shop's rule: no downgrades); an upgrade only if they don't have it yet
 * (a pickup is level 1). One they can't use stays on the map for someone else.
 */
function canCollect(player: Player, pickup: Pickup): boolean {
    if (pickup.kind !== 'item') return true;
    if (!isShopItemId(pickup.itemId)) return false;
    const item = SHOP_ITEMS[pickup.itemId];
    if (item.upgrade) return upgradeLevel(player, item.upgrade) === 0;
    return !ownsShopItem(player, pickup.itemId);
}

function collect(player: Player, pickup: Pickup): void {
    if (pickup.kind === 'materials') player.materials += pickup.amount;
    else if (pickup.kind === 'ammo') player.ammo += pickup.amount;
    else if (isShopItemId(pickup.itemId)) ShopSystem.grant(player, pickup.itemId);
}

/**
 * During `playing`, a connected player standing on a pickup's hex takes it (if they can use it):
 * it's applied, removed from state, and announced with a `pickupCollected` broadcast.
 */
function update(state: GameState, broadcast: Broadcast): void {
    if (state.phase.phase !== 'playing' || state.pickups.size === 0) return;

    state.players.forEach((player) => {
        if (!player.connected) return;
        const { col, row } = pixelToHex(player.x, player.y);
        state.pickups.forEach((pickup, id) => {
            if (pickup.tileX !== col || pickup.tileY !== row || !canCollect(player, pickup)) {
                return;
            }
            collect(player, pickup);
            state.pickups.delete(id);
            broadcast('pickupCollected', {
                playerId: player.id,
                kind: pickup.kind as PickupKind,
                itemId: isShopItemId(pickup.itemId) ? pickup.itemId : '',
                amount: pickup.amount,
            } satisfies PickupCollectedEvent);
        });
    });
}

export const PickupSystem = { update, canCollect };
