import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/GameState';
import { PickupSystem } from './PickupSystem';
import { addPlayerAt, addStructure, world } from '../test/world';
import {
    MATCH_DURATION_MS,
    PICKUP_GRID,
    PICKUP_RESPAWN_DELAY_MAX_MS,
    PICKUP_RESPAWN_MS,
} from '../constants';
import type { PickupCollectedEvent } from '../types/shared';

const START = 1_000_000; // when the test match started (server ms)

/** A match that started at START; `tiles` for the respawn tests, which place pods on ground. */
function match(tiles = false): GameState {
    const state = world('playing', { tiles });
    state.phase.endsAt = START + MATCH_DURATION_MS;
    return state;
}

function addPod(state: GameState, col: number, row: number, cell = -1) {
    return PickupSystem.addPod(state, { col, row, cell });
}

function run(
    state: GameState,
    random: () => number = () => 0,
    now = START + 1000
): PickupCollectedEvent[] {
    const events: PickupCollectedEvent[] = [];
    PickupSystem.update(
        state,
        (type, payload) => {
            if (type === 'pickupCollected') events.push(payload as PickupCollectedEvent);
        },
        random,
        now
    );
    return events;
}

describe('PickupSystem', () => {
    it('walking onto a pod opens it once: contents applied, pod removed, everyone told', () => {
        const state = match();
        addPod(state, 10, 10);
        const p = addPlayerAt(state, 'a', 10, 10);
        // random 0: the first option of the row (materials) with the smallest amount.
        const events = run(state);
        expect(events).toEqual([{ playerId: 'a', kind: 'materials', itemId: '', amount: 10 }]);
        expect(p.materials).toBe(10);
        expect(state.pickups.size).toBe(0);
        expect(run(state)).toEqual([]);
    });

    it('does nothing next to the pod, outside the playing phase, or for a disconnected player', () => {
        const state = match();
        state.phase.phase = 'countdown';
        addPod(state, 10, 10);
        const p = addPlayerAt(state, 'a', 11, 10);
        const q = addPlayerAt(state, 'b', 10, 10);
        run(state);
        state.phase.phase = 'playing';
        q.connected = false;
        run(state);
        expect(state.pickups.size).toBe(1);
        expect(p.materials + q.materials).toBe(0);
    });

    it("rolls on the collector's score tier: the same roll gives the leader less than the last", () => {
        // A roll of 0.95 lands on the big gun in tier 1's row but a structure in tier 4's.
        const state = match();
        const leader = addPlayerAt(state, 'lead', 10, 10);
        const last = addPlayerAt(state, 'last', 20, 20);
        addPlayerAt(state, 'mid1', 30, 30).score = 60;
        addPlayerAt(state, 'mid2', 40, 40).score = 40;
        leader.score = 100;
        last.score = 0;
        addPod(state, 10, 10);
        addPod(state, 20, 20);
        const events = run(state, () => 0.95);
        expect(events.find((e) => e.playerId === 'lead')).toMatchObject({ itemId: 'bigGun' });
        expect(leader.gun).toBe('big');
        const lastGot = events.find((e) => e.playerId === 'last');
        expect(lastGot?.kind).toBe('item');
        expect(['farm', 'fabricator', 'fort', 'power']).toContain(lastGot?.itemId);
        expect(last.structureInventory).toHaveLength(1);
    });

    it('respawn wave: at PICKUP_RESPAWN_MS, empty cells get new pods after a 0-15 s delay', () => {
        const state = match(true);
        const kept = addPod(state, 8, 10, 0); // cell 0 still has its pod
        const wave = START + PICKUP_RESPAWN_MS;
        run(state, () => 0.5, wave - 1);
        expect(state.pickups.size).toBe(1); // not yet
        run(state, () => 0.5, wave);
        // All other cells refilled (random 0.5: no empties), each waiting 0.5 x the max delay.
        const cells = PICKUP_GRID.cols * PICKUP_GRID.rows;
        expect(state.pendingPods).toHaveLength(cells - 1);
        expect(state.pendingPods.every((p) => p.cell !== 0)).toBe(true);
        expect(state.pickups.size).toBe(1);
        run(state, () => 0.5, wave + PICKUP_RESPAWN_DELAY_MAX_MS / 2);
        expect(state.pickups.size).toBe(cells);
        expect(state.pendingPods).toHaveLength(0);
        expect(state.pickups.get(kept.id)).toBe(kept);
        expect(state.nextPodWaveAt).toBe(wave + PICKUP_RESPAWN_MS); // the next wave, if the match lasts
    });

    it("a waiting pod doesn't appear on a hex taken by a structure since", () => {
        const state = match(true);
        addPod(state, 8, 10, 0);
        const wave = START + PICKUP_RESPAWN_MS;
        run(state, () => 0.5, wave);
        const target = state.pendingPods[0];
        addStructure(state, 'x', target.col, target.row);
        const before = state.pickups.size;
        run(state, () => 0.5, wave + PICKUP_RESPAWN_DELAY_MAX_MS);
        // 11 were waiting: 10 appear, the one whose hex is now under the structure is dropped.
        expect(state.pendingPods).toHaveLength(0);
        expect(state.pickups.size).toBe(before + 10);
        const onIt = Array.from(state.pickups.values()).some(
            (p) => p.tileX === target.col && p.tileY === target.row
        );
        expect(onIt).toBe(false);
    });

    it('does nothing when the map never had pods (the feature flag is off)', () => {
        const state = match(true);
        run(state, () => 0.5, START + PICKUP_RESPAWN_MS);
        expect(state.pendingPods).toHaveLength(0);
        expect(state.pickups.size).toBe(0);
    });
});
