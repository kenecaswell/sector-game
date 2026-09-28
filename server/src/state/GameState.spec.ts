import { Decoder, Encoder } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, BASE_MAX_HEALTH } from '../constants';
import { DEFAULT_CHARACTER, GUN_DAMAGE, TERRAIN } from '../types/shared';
import { GameState, Pickup, Player, Projectile, Structure, Tile } from './GameState';

describe('GameState schema', () => {
    // Guards the setup gotcha in ARCHITECTURE.md: without `useDefineForClassFields: false` the field
    // initializers overwrite the schema's accessors and change tracking silently stops working.
    it('syncs state and later changes through Colyseus encoding (a full sync, then a delta)', () => {
        const state = new GameState();
        const player = new Player();
        player.name = 'Ada';
        player.structureInventory.push('farm');
        state.players.set('a', player);

        const encoder = new Encoder(state);
        const client = new GameState();
        const decoder = new Decoder(client);
        decoder.decode(encoder.encodeAll());
        expect(client.players.get('a')?.name).toBe('Ada');
        expect(Array.from(client.players.get('a')!.structureInventory)).toEqual(['farm']);

        encoder.discardChanges();
        player.health = 42;
        player.boosterLevel = 2;
        player.equippedUpgrade = 'booster';
        decoder.decode(encoder.encode());
        expect(client.players.get('a')?.health).toBe(42);
        expect(client.players.get('a')?.boosterLevel).toBe(2);
        expect(client.players.get('a')?.equippedUpgrade).toBe('booster');
    });

    it("syncs each tile's terrain (sent once with the full state)", () => {
        const state = new GameState();
        for (const terrain of [TERRAIN.ground, TERRAIN.mountain, TERRAIN.water]) {
            const tile = new Tile();
            tile.terrain = terrain;
            state.tiles.push(tile);
        }
        const client = new GameState();
        new Decoder(client).decode(new Encoder(state).encodeAll());
        expect(client.tiles.map((t) => t.terrain)).toEqual([
            TERRAIN.ground,
            TERRAIN.mountain,
            TERRAIN.water,
        ]);
        expect(new Tile().terrain).toBe(TERRAIN.ground);
    });

    it('syncs pickups, and their removal; server-only fields (claimedBefore, spawnSlot) stay put', () => {
        const state = new GameState();
        const pickup = new Pickup();
        Object.assign(pickup, { id: 'p1', tileX: 3, tileY: 4 });
        state.pickups.set('p1', pickup);
        const tile = new Tile();
        tile.claimedBefore = true;
        state.tiles.push(tile);
        const encoder = new Encoder(state);
        const client = new GameState();
        const decoder = new Decoder(client);
        decoder.decode(encoder.encodeAll());
        // Only where it is: contents are rolled on collection and never synced.
        expect(client.pickups.get('p1')?.toJSON()).toEqual({ id: 'p1', tileX: 3, tileY: 4 });
        expect(client.tiles[0].claimedBefore).toBe(false); // not synced

        encoder.discardChanges();
        state.pickups.delete('p1');
        decoder.decode(encoder.encode());
        expect(client.pickups.size).toBe(0);
    });

    it('starts players unarmed and broke, at full base health, as the default character', () => {
        const player = new Player();
        expect(player).toMatchObject({
            health: BASE_MAX_HEALTH,
            maxHealth: BASE_MAX_HEALTH,
            ammo: 0,
            materials: 0,
            gun: '',
            character: DEFAULT_CHARACTER,
            ready: false,
            teamId: '',
            claimRadius: BASE_CLAIM_RADIUS,
            connected: true,
        });
        expect(player.structureInventory).toHaveLength(0);
        expect(player).toMatchObject({
            boosterLevel: 0,
            expanderLevel: 0,
            armorLevel: 0,
            wingsLevel: 0,
            equippedUpgrade: '',
        });
    });

    it('defaults shots to basic-gun damage and structures to full health', () => {
        expect(new Projectile().damage).toBe(GUN_DAMAGE.basic);
        const structure = new Structure();
        expect(structure.health).toBe(structure.maxHealth);
    });

    it('starts in the lobby with no timer on a 64 x 64 map', () => {
        const state = new GameState();
        expect(state.phase.phase).toBe('lobby');
        expect(state.phase.endsAt).toBe(0);
        expect([state.mapWidth, state.mapHeight]).toEqual([64, 64]);
    });
});
