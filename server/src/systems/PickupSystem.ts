import { Pickup, type GameState, type Player } from '../state/GameState';
import { inStructureFootprint, pixelToHex, type HexCoord } from '../hex';
import { PICKUP_RESPAWN_DELAY_MAX_MS, PICKUP_RESPAWN_MS } from '../constants';
import {
    generatePickups,
    pickupGrid,
    rollPickup,
    scoreTier,
    type PickupContents,
    type PodSpot,
} from '../pickups';
import { isShopItemId, type PickupCollectedEvent } from '../types/shared';
import { ShopSystem } from './ShopSystem';
import { PhaseSystem } from './PhaseSystem';
import type { Broadcast } from './Broadcast';

/** Puts a drop pod on the map (at the start of a match, or when a respawned one appears). */
function addPod(state: GameState, spot: PodSpot): Pickup {
    const pod = new Pickup();
    pod.id = `pod-${state.podsMade++}`;
    pod.tileX = spot.col;
    pod.tileY = spot.row;
    pod.cell = spot.cell;
    state.pickups.set(pod.id, pod);
    return pod;
}

function apply(player: Player, contents: PickupContents): void {
    if (contents.kind === 'materials') player.materials += contents.amount;
    else if (contents.kind === 'ammo') player.ammo += contents.amount;
    else if (isShopItemId(contents.itemId)) ShopSystem.grant(player, contents.itemId);
}

/** A hex a respawned pod can't use: one with a pod on it, or under a structure. */
function blockedForPods(state: GameState): (h: HexCoord) => boolean {
    return (h) =>
        Array.from(state.pickups.values()).some((p) => p.tileX === h.col && p.tileY === h.row) ||
        Array.from(state.structures.values()).some((s) =>
            inStructureFootprint(h.col, h.row, s.tileX, s.tileY)
        );
}

/**
 * Respawn waves: every PICKUP_RESPAWN_MS into the match, each grid cell with no pod (on the map or
 * waiting) is refilled by `generatePickups` (same placement and empty chance as the start), each new
 * pod appearing after its own random 0 - PICKUP_RESPAWN_DELAY_MAX_MS delay. Waiting pods appear when
 * their time comes, unless their hex has been taken since (by a structure or another pod).
 */
function respawn(state: GameState, now: number, random: () => number): void {
    const matchStart = state.phase.endsAt - PhaseSystem.matchDurationMs(state);
    if (state.nextPodWaveAt === 0) state.nextPodWaveAt = matchStart + PICKUP_RESPAWN_MS;

    if (now >= state.nextPodWaveAt) {
        state.nextPodWaveAt += PICKUP_RESPAWN_MS;
        const filled = new Set([
            ...Array.from(state.pickups.values(), (pod) => pod.cell),
            ...state.pendingPods.map((pod) => pod.cell),
        ]);
        const cells: number[] = [];
        const grid = pickupGrid(state.mapWidth, state.mapHeight);
        for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
            if (!filled.has(cell)) cells.push(cell);
        }
        const terrain = Array.from(state.tiles, (tile) => tile.terrain);
        const spots = generatePickups(terrain, state.mapWidth, state.mapHeight, random, {
            cells,
            blocked: blockedForPods(state),
        });
        for (const spot of spots) {
            state.pendingPods.push({
                ...spot,
                appearsAt: now + random() * PICKUP_RESPAWN_DELAY_MAX_MS,
            });
        }
    }

    if (state.pendingPods.length === 0) return;
    const blocked = blockedForPods(state);
    state.pendingPods = state.pendingPods.filter((pending) => {
        if (pending.appearsAt > now) return true;
        if (!blocked(pending)) addPod(state, pending);
        return false;
    });
}

/**
 * During `playing`: runs respawn waves, then a connected player standing on a drop pod's hex opens
 * it. What's inside is rolled there and then for that player's score tier (`scoreTier` over
 * everyone's current scores, then `rollPickup`), applied, and announced with a `pickupCollected`
 * broadcast; the pod is removed. Clients never see a pod's contents before that. Nothing happens
 * if the map never had pods (the PICKUPS_ENABLED flag is off). `random` and `now` are for tests.
 */
function update(
    state: GameState,
    broadcast: Broadcast,
    random: () => number = Math.random,
    now: number = Date.now()
): void {
    if (state.phase.phase !== 'playing' || state.podsMade === 0) return;
    respawn(state, now, random);

    const scores = Array.from(state.players.values(), (player) => player.score);
    state.players.forEach((player) => {
        if (!player.connected || player.respawnAt > 0) return;
        const { col, row } = pixelToHex(player.x, player.y);
        state.pickups.forEach((pod, id) => {
            if (pod.tileX !== col || pod.tileY !== row) return;
            const contents = rollPickup(scoreTier(scores, player.score), player, random);
            apply(player, contents);
            state.pickups.delete(id);
            broadcast('pickupCollected', {
                playerId: player.id,
                ...contents,
            } satisfies PickupCollectedEvent);
        });
    });
}

export const PickupSystem = { update, addPod };
