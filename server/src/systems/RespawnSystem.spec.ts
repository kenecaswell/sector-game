import { describe, expect, it } from 'vitest';
import { RESPAWN_DELAY_MS } from '../constants';
import { hexCenter, inStructureFootprint } from '../hex';
import { Pickup, type GameState, type Player } from '../state/GameState';
import {
    addPlayerAt,
    addStructure,
    inputs,
    runMovement,
    setTerrain,
    tileAt,
    world,
} from '../test/world';
import { spawnPoint } from '../terrain';
import { TERRAIN } from '../types/shared';
import { CollisionSystem } from './CollisionSystem';
import { PickupSystem } from './PickupSystem';
import { RespawnSystem } from './RespawnSystem';
import { StructureSystem } from './StructureSystem';
import { UpgradeSystem } from './UpgradeSystem';

const NOW = 1_000_000;
const quiet = () => {};

/** A player at hex (col, row) carrying a Ion Cannon, 12 ammo, Booster 2 (equipped) and Armor 1. */
function geared(state: GameState, id = 'a', col = 20, row = 20): Player {
    const player = addPlayerAt(state, id, col, row);
    Object.assign(player, {
        gun: 'big',
        ammo: 12,
        boosterLevel: 2,
        armorLevel: 1,
        equippedUpgrade: 'booster',
        materials: 77,
        kills: 3,
    });
    player.structureInventory.push('farm');
    UpgradeSystem.applyUpgradeEffects(player);
    return player;
}

/** Moves a player onto the center of hex (col, row). */
function standOn(player: Player, col: number, row: number): void {
    Object.assign(player, hexCenter(col, row));
}

describe('RespawnSystem — defeat', () => {
    it('drops the gun, ammo and upgrades in a backpack where they fell; keeps the rest', () => {
        const state = world();
        const player = geared(state);
        const pack = RespawnSystem.defeat(state, player, NOW)!;
        expect(pack).toMatchObject({ ownerId: 'a', tileX: 20, tileY: 20, gun: 'big', ammo: 12 });
        expect([pack.boosterLevel, pack.armorLevel, pack.equippedUpgrade]).toEqual([
            2,
            1,
            'booster',
        ]);
        expect(state.backpacks.get(pack.id)).toBe(pack);
        expect(player).toMatchObject({
            gun: '',
            ammo: 0,
            boosterLevel: 0,
            armorLevel: 0,
            equippedUpgrade: '',
            maxHealth: 100,
            health: 0,
            respawnAt: NOW + RESPAWN_DELAY_MS,
            materials: 77,
            kills: 3,
        });
        expect(Array.from(player.structureInventory)).toEqual(['farm']);
    });

    it('drops nothing when there is nothing to drop', () => {
        const state = world();
        const player = addPlayerAt(state, 'a', 20, 20);
        expect(RespawnSystem.defeat(state, player, NOW)).toBeNull();
        expect(state.backpacks.size).toBe(0);
        expect(player.respawnAt).toBe(NOW + RESPAWN_DELAY_MS);
    });

    it('falling over a mountain or deep water (with the Jetpack), the backpack lands on the nearest walkable hex', () => {
        const state = world();
        const lake: Array<[number, number]> = [];
        for (let col = 18; col <= 22; col++)
            for (let row = 18; row <= 22; row++) lake.push([col, row]);
        setTerrain(state, TERRAIN.water, lake);
        const player = geared(state);
        player.wingsLevel = 1;
        const pack = RespawnSystem.defeat(state, player, NOW)!;
        expect(tileAt(state, pack.tileX, pack.tileY).terrain).toBe(TERRAIN.ground);
        expect(Math.abs(pack.tileX - 20)).toBeLessThanOrEqual(3);
        expect(Math.abs(pack.tileY - 20)).toBeLessThanOrEqual(3);
    });
});

describe('RespawnSystem — while down, and respawning', () => {
    it("can't move, claim, open pods or build until the delay is over, then respawns at its spawn", () => {
        const state = world();
        const player = geared(state);
        player.spawnSlot = 2;
        RespawnSystem.defeat(state, player, Date.now());
        const pod = new Pickup();
        Object.assign(pod, { id: 'pod', tileX: 20, tileY: 20 });
        state.pickups.set('pod', pod);
        state.podsMade = 1;

        runMovement(state, inputs({ a: { x: 1, y: 0 } }), 10);
        expect(player.x).toBe(hexCenter(20, 20).x);
        CollisionSystem.update(state, quiet);
        expect(tileAt(state, 20, 20).ownerId).toBe('');
        PickupSystem.update(state, quiet);
        expect(state.pickups.has('pod')).toBe(true);
        expect(StructureSystem.place(state, player, 'farm', 20, 20)).toBe(false);

        RespawnSystem.update(state, quiet, player.respawnAt - 1);
        expect(player.respawnAt).toBeGreaterThan(0);
        RespawnSystem.update(state, quiet, player.respawnAt);
        const start = spawnPoint(state, 2);
        expect(player).toMatchObject({ respawnAt: 0, health: 100, x: start.x, y: start.y });
    });
});

describe('RespawnSystem — taking a backpack back', () => {
    it('only its owner, walking onto its hex once back in play, takes it; they hear what was in it', () => {
        const state = world();
        const owner = geared(state);
        const pack = RespawnSystem.defeat(state, owner, NOW)!;
        const other = addPlayerAt(state, 'b', 30, 30);
        const messages: Array<[string, string, unknown]> = [];
        const notify = (id: string, type: string, payload: unknown) =>
            messages.push([id, type, payload]);

        RespawnSystem.update(state, notify, NOW + 1); // the owner is down, on top of it
        standOn(other, 20, 20);
        RespawnSystem.update(state, notify, NOW + 2); // someone else walks over it
        expect(state.backpacks.has(pack.id)).toBe(true);
        expect(other.gun).toBe('');

        RespawnSystem.update(state, notify, NOW + RESPAWN_DELAY_MS); // respawns at its spawn
        expect(state.backpacks.has(pack.id)).toBe(true);
        standOn(owner, 20, 20);
        RespawnSystem.update(state, notify, NOW + RESPAWN_DELAY_MS + 1);
        expect(state.backpacks.has(pack.id)).toBe(false);
        expect(owner).toMatchObject({
            gun: 'big',
            ammo: 12,
            boosterLevel: 2,
            armorLevel: 1,
            equippedUpgrade: 'booster',
            maxHealth: 200,
            health: 200, // Armor's extra health comes back too
        });
        expect(messages).toEqual([
            ['a', 'backpackCollected', { contents: 'Ion Cannon, 12 ammo, Booster 2, Armor 1' }],
        ]);
    });

    it('keeps whatever is better of what they have now, and adds the ammo', () => {
        const state = world();
        const owner = geared(state);
        RespawnSystem.defeat(state, owner, NOW);
        RespawnSystem.update(state, quiet, NOW + RESPAWN_DELAY_MS);
        // Fabricated again meanwhile: a Blaster, 30 ammo, Booster 3, and the Harvester equipped.
        Object.assign(owner, { gun: 'basic', ammo: 30, boosterLevel: 3, expanderLevel: 1 });
        owner.equippedUpgrade = 'expander';
        standOn(owner, 20, 20);
        RespawnSystem.update(state, quiet, NOW + RESPAWN_DELAY_MS + 1);
        expect(owner).toMatchObject({
            gun: 'big',
            ammo: 42,
            boosterLevel: 3,
            expanderLevel: 1,
            armorLevel: 1,
            equippedUpgrade: 'expander',
        });
    });

    it('never lands inside an enemy structure; and leaves with its owner', () => {
        const state = world();
        const owner = geared(state);
        addPlayerAt(state, 'foe', 40, 40);
        addStructure(state, 'foe', 20, 20);
        const pack = RespawnSystem.defeat(state, owner, NOW)!;
        expect(inStructureFootprint(pack.tileX, pack.tileY, 20, 20)).toBe(false);
        RespawnSystem.removeBackpacksOf(state, 'a');
        expect(state.backpacks.size).toBe(0);
    });
});
