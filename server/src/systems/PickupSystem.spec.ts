import { describe, expect, it } from 'vitest';
import { Pickup, type GameState } from '../state/GameState';
import { UpgradeSystem } from './UpgradeSystem';
import { PickupSystem } from './PickupSystem';
import { addPlayerAt, world } from '../test/world';
import type { PickupCollectedEvent } from '../types/shared';

function addPickup(state: GameState, col: number, row: number, fields: Partial<Pickup>): Pickup {
    const pickup = new Pickup();
    Object.assign(pickup, { id: `pk-${col}-${row}`, tileX: col, tileY: row, ...fields });
    state.pickups.set(pickup.id, pickup);
    return pickup;
}

function run(state: GameState): PickupCollectedEvent[] {
    const events: PickupCollectedEvent[] = [];
    PickupSystem.update(state, (type, payload) => {
        if (type === 'pickupCollected') events.push(payload as PickupCollectedEvent);
    });
    return events;
}

describe('PickupSystem', () => {
    it('materials and ammo: walking onto the hex takes the pile, once, and tells everyone', () => {
        const state = world('playing', { tiles: false });
        addPickup(state, 10, 10, { kind: 'materials', amount: 30 });
        addPickup(state, 12, 10, { kind: 'ammo', amount: 20 });
        const p = addPlayerAt(state, 'a', 10, 10);
        expect(run(state)).toEqual([{ playerId: 'a', kind: 'materials', itemId: '', amount: 30 }]);
        expect(p.materials).toBe(30);
        expect(state.pickups.size).toBe(1);
        expect(run(state)).toEqual([]);
        expect(p.materials).toBe(30);

        const q = addPlayerAt(state, 'b', 12, 10);
        run(state);
        expect(q.ammo).toBe(20);
        expect(state.pickups.size).toBe(0);
    });

    it('does nothing next to the hex, outside the playing phase, or for a disconnected player', () => {
        const state = world('countdown', { tiles: false });
        addPickup(state, 10, 10, { kind: 'materials', amount: 30 });
        const p = addPlayerAt(state, 'a', 11, 10);
        const q = addPlayerAt(state, 'b', 10, 10);
        run(state);
        state.phase.phase = 'playing';
        q.connected = false;
        run(state);
        expect(state.pickups.size).toBe(1);
        expect(p.materials + q.materials).toBe(0);
    });

    it('guns follow the shop rule: basic only when unarmed, big unless you have it', () => {
        const state = world('playing', { tiles: false });
        addPickup(state, 10, 10, { kind: 'item', itemId: 'basicGun' });
        const armed = addPlayerAt(state, 'a', 10, 10);
        armed.gun = 'big';
        run(state);
        expect(state.pickups.size).toBe(1); // left for someone who can use it
        armed.gun = '';
        run(state);
        expect(armed.gun).toBe('basic');

        addPickup(state, 20, 20, { kind: 'item', itemId: 'bigGun' });
        armed.x = armed.y = 0;
        const other = addPlayerAt(state, 'b', 20, 20);
        other.gun = 'basic';
        run(state);
        expect(other.gun).toBe('big');
    });

    it('an upgrade pickup is level 1: only for someone without it, equipped into an empty slot', () => {
        const state = world('playing', { tiles: false });
        addPickup(state, 10, 10, { kind: 'item', itemId: 'booster' });
        const owner = addPlayerAt(state, 'a', 10, 10);
        owner.boosterLevel = 1;
        run(state);
        expect(owner.boosterLevel).toBe(1);
        expect(state.pickups.size).toBe(1);

        owner.x = owner.y = 0;
        const fresh = addPlayerAt(state, 'b', 10, 10);
        run(state);
        expect(fresh.boosterLevel).toBe(1);
        expect(fresh.equippedUpgrade).toBe('booster');
    });

    it('armor from a pickup raises max health at once, like buying it', () => {
        const state = world('playing', { tiles: false });
        addPickup(state, 10, 10, { kind: 'item', itemId: 'armor' });
        const p = addPlayerAt(state, 'a', 10, 10);
        run(state);
        UpgradeSystem.applyUpgradeEffects(p);
        expect(p.armorLevel).toBe(1);
        expect(p.health).toBe(p.maxHealth);
        expect(p.maxHealth).toBe(200);
    });

    it('a structure pickup adds one to the inventory', () => {
        const state = world('playing', { tiles: false });
        addPickup(state, 10, 10, { kind: 'item', itemId: 'fort' });
        const p = addPlayerAt(state, 'a', 10, 10);
        p.structureInventory.push('farm');
        run(state);
        expect(Array.from(p.structureInventory)).toEqual(['farm', 'fort']);
    });
});
