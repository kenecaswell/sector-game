import { Decoder, Encoder, StateView } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, BASE_MAX_HEALTH } from '../constants';
import { DEFAULT_CHARACTER, GUN_DAMAGE, TERRAIN } from '../types/shared';
import {
    Backpack,
    GameState,
    MountainPiece,
    Pickup,
    Player,
    Projectile,
    Structure,
    Tile,
} from './GameState';

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

    it('defaults shots to blaster damage and structures to full health', () => {
        expect(new Projectile().damage).toBe(GUN_DAMAGE.basic);
        expect(new Projectile().speed).toBe(600); // on-screen px/s (400 until 2026-09-27)
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

describe('GameState — backpacks are private', () => {
    it("only a client whose view holds a backpack gets it, and never what's inside", () => {
        const state = new GameState();
        const encoder = new Encoder(state);
        const ownerView = new StateView();
        const otherView = new StateView();
        ownerView.add(state);
        otherView.add(state);
        const owner = new GameState();
        const other = new GameState();
        const ownerDecoder = new Decoder(owner);
        const otherDecoder = new Decoder(other);
        // What Colyseus's SchemaSerializer does: encode the shared changes, then each view's extra.
        const sync = (full: boolean) => {
            const it = { offset: 0 };
            if (full) encoder.encodeAll(it);
            else encoder.encode(it);
            const shared = it.offset;
            ownerDecoder.decode(
                full
                    ? encoder.encodeAllView(ownerView, shared, { ...it })
                    : encoder.encodeView(ownerView, shared, it)
            );
            otherDecoder.decode(
                full
                    ? encoder.encodeAllView(otherView, shared, { ...it })
                    : encoder.encodeView(otherView, shared, it)
            );
            encoder.discardChanges();
        };
        sync(true);

        const pack = new Backpack();
        Object.assign(pack, { id: 'b1', ownerId: 'a', tileX: 5, tileY: 6, gun: 'big', ammo: 9 });
        state.backpacks.set('b1', pack);
        ownerView.add(pack);
        sync(false);
        expect(owner.backpacks.get('b1')).toMatchObject({ ownerId: 'a', tileX: 5, tileY: 6 });
        expect(owner.backpacks.get('b1')?.gun).toBe(''); // contents stay on the server
        expect(other.backpacks.size).toBe(0);

        state.backpacks.delete('b1');
        sync(false);
        expect(owner.backpacks.size).toBe(0);
    });
});

describe('GameState — mountains', () => {
    it('syncs each mountain piece: its size and its hexes (tile indices)', () => {
        const state = new GameState();
        const small = new MountainPiece();
        small.size = 3;
        small.hexes.push(10, 11, 75);
        const large = new MountainPiece();
        large.size = 7;
        large.hexes.push(200, 201, 202, 136, 137, 264, 265);
        state.mountains.push(small, large);
        const client = new GameState();
        new Decoder(client).decode(new Encoder(state).encodeAll());
        expect(client.mountains.map((m) => [m.size, Array.from(m.hexes)])).toEqual([
            [3, [10, 11, 75]],
            [7, [200, 201, 202, 136, 137, 264, 265]],
        ]);
    });
});

describe('GameState — theme', () => {
    it("syncs the match's color scheme", () => {
        const state = new GameState();
        expect(state.theme).toBe('slate');
        state.theme = 'titan';
        const client = new GameState();
        new Decoder(client).decode(new Encoder(state).encodeAll());
        expect(client.theme).toBe('titan');
    });
});
