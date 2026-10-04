import { describe, expect, it } from 'vitest';
import { compactFootprint, hexNeighbors, structureFootprint } from '../hex';
import {
    BASE_TILE_CAP,
    DEFAULT_GAME_SETTINGS,
    MAP_SIZES,
    STRUCTURE_SPECS,
    TILES_PER_FARM,
    maxGuardTowers,
} from '../types/shared';
import { addPlayer, addStructure, ownFootprint, tileAt, world } from '../test/world';
import { StructureSystem } from './StructureSystem';

describe('StructureSystem.canPlace', () => {
    it('allows a structure when all 7 footprint hexes are yours', () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 20, 20)).toBe(true);
        expect(StructureSystem.canPlace(state, 'b', 'farm', 20, 20)).toBe(false);
    });

    it("refuses when even one of the 7 isn't yours (a teammate's included)", () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        const n = hexNeighbors(20, 20)[3];
        tileAt(state, n.col, n.row).ownerId = 'mate';
        expect(StructureSystem.canPlace(state, 'a', 'farm', 20, 20)).toBe(false);
    });

    it('refuses at the map edge, where part of the footprint is off the map', () => {
        const state = world();
        for (let r = 0; r < 64; r++) {
            for (const c of [0, 1, 62, 63]) tileAt(state, c, r).ownerId = 'a';
        }
        for (let c = 0; c < 64; c++) tileAt(state, c, 0).ownerId = 'a';
        expect(StructureSystem.canPlace(state, 'a', 'farm', 0, 10)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 5, 0)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 63, 30)).toBe(false);
    });

    it("refuses overlapping another structure's footprint, but allows touching it", () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        ownFootprint(state, 'a', 22, 20);
        ownFootprint(state, 'a', 23, 21);
        addStructure(state, 'a', 20, 20);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 20, 20)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 22, 20)).toBe(false); // shares a hex
        const touching = structureFootprint(23, 21).every(
            (h) => !structureFootprint(20, 20).some((g) => g.col === h.col && g.row === h.row)
        );
        expect(touching).toBe(true);
        expect(StructureSystem.canPlace(state, 'a', 'farm', 23, 21)).toBe(true);
    });
});

describe('StructureSystem.applyDamage', () => {
    it('lowers health, and removes and announces the structure at 0', () => {
        const state = world();
        const farm = addStructure(state, 'a', 10, 10);
        const events: unknown[] = [];
        StructureSystem.applyDamage(state, farm.id, 400, (type, payload) =>
            events.push([type, payload])
        );
        expect(farm.health).toBe(600);
        StructureSystem.applyDamage(state, farm.id, 600, (type, payload) =>
            events.push([type, payload])
        );
        expect(state.structures.has(farm.id)).toBe(false);
        expect(events).toEqual([['structureDestroyed', { structureId: farm.id }]]);
    });

    it('ignores an unknown structure', () => {
        expect(() => StructureSystem.applyDamage(world(), 'nope', 50)).not.toThrow();
    });
});

describe('StructureSystem.place', () => {
    it('places one from the inventory where canPlace allows, using it up', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        player.structureInventory.push('farm', 'guardTower');
        expect(StructureSystem.place(state, player, 'guardTower', 20, 20)).toBe(false); // not theirs yet
        ownFootprint(state, 'a', 20, 20);
        expect(StructureSystem.place(state, player, 'power', 20, 20)).toBe(false); // none held
        expect(StructureSystem.place(state, player, 'guardTower', 20, 20)).toBe(true);
        expect(Array.from(player.structureInventory)).toEqual(['farm']);
        expect(Array.from(state.structures.values())).toMatchObject([
            { ownerId: 'a', tileX: 20, tileY: 20, type: 'guardTower' },
        ]);
        state.phase.phase = 'results';
        ownFootprint(state, 'a', 30, 30);
        expect(StructureSystem.place(state, player, 'farm', 30, 30)).toBe(false);
    });
});

describe('StructureSystem — structure types', () => {
    it('every type but the Guard Tower has 1000 health; the tower has 500 (set when placed)', () => {
        expect(STRUCTURE_SPECS.farm.health).toBe(1000);
        expect(STRUCTURE_SPECS.fabricator.health).toBe(1000);
        expect(STRUCTURE_SPECS.power.health).toBe(1000);
        expect(STRUCTURE_SPECS.guardTower.health).toBe(500);

        const state = world();
        const player = addPlayer(state, 'a');
        player.structureInventory.push('guardTower', 'farm');
        ownFootprint(state, 'a', 20, 20, 'guardTower');
        ownFootprint(state, 'a', 30, 30, 'farm');
        StructureSystem.place(state, player, 'guardTower', 20, 20);
        StructureSystem.place(state, player, 'farm', 30, 30);
        expect(state.structures.get('struct-20-20')).toMatchObject({ health: 500, maxHealth: 500 });
        expect(state.structures.get('struct-30-30')).toMatchObject({
            health: 1000,
            maxHealth: 1000,
        });
    });

    it('a Guard Tower needs only its 3 touching hexes to be yours, at any of its six turns', () => {
        const state = world();
        for (let rotation = 0; rotation < 6; rotation++) {
            const clean = world();
            ownFootprint(clean, 'a', 20, 20, 'guardTower', rotation);
            expect(StructureSystem.canPlace(clean, 'a', 'guardTower', 20, 20, rotation)).toBe(true);
            // A farm needs all 7, so the same hexes don't do for one.
            expect(StructureSystem.canPlace(clean, 'a', 'farm', 20, 20)).toBe(false);
        }
        ownFootprint(state, 'a', 20, 20, 'guardTower', 0);
        expect(StructureSystem.canPlace(state, 'a', 'guardTower', 20, 20, 3)).toBe(false);
    });

    it("refuses a Guard Tower on a hex that's another structure's, and records its turn", () => {
        const state = world();
        const player = addPlayer(state, 'a');
        player.structureInventory.push('guardTower', 'guardTower');
        ownFootprint(state, 'a', 20, 20, 'guardTower', 2);
        expect(StructureSystem.place(state, player, 'guardTower', 20, 20, 2)).toBe(true);
        expect(state.structures.get('struct-20-20')?.rotation).toBe(2);
        expect(StructureSystem.place(state, player, 'guardTower', 20, 20, 2)).toBe(false);
        // Overlapping by one hex is still overlapping.
        const shared = compactFootprint(20, 20, 2)[1];
        ownFootprint(state, 'a', shared.col, shared.row, 'guardTower', 5);
        const overlaps = compactFootprint(shared.col, shared.row, 5).some((h) =>
            compactFootprint(20, 20, 2).some((g) => g.col === h.col && g.row === h.row)
        );
        expect(overlaps).toBe(true);
        expect(StructureSystem.canPlace(state, 'a', 'guardTower', shared.col, shared.row, 5)).toBe(
            false
        );
    });

    it('a Guard Tower and a farm may touch without overlapping', () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20, 'farm');
        addStructure(state, 'a', 20, 20, 'farm');
        const towerHex = compactFootprint(25, 20, 0);
        for (const h of towerHex) state.tiles[h.row * state.mapWidth + h.col].ownerId = 'a';
        expect(StructureSystem.canPlace(state, 'a', 'guardTower', 25, 20, 0)).toBe(true);
    });
});

describe('StructureSystem — tile limit and Fabricator', () => {
    it('everyone starts at 500; each farm placed adds 500', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        expect(player.tileCap).toBe(BASE_TILE_CAP);
        player.structureInventory.push('farm', 'farm');
        ownFootprint(state, 'a', 20, 20);
        ownFootprint(state, 'a', 30, 30);
        StructureSystem.place(state, player, 'farm', 20, 20);
        expect(player.tileCap).toBe(BASE_TILE_CAP + TILES_PER_FARM);
        StructureSystem.place(state, player, 'farm', 30, 30);
        expect(player.tileCap).toBe(BASE_TILE_CAP + 2 * TILES_PER_FARM);
    });

    it("other structures do not raise it, and a farm is only its owner's", () => {
        const state = world();
        const player = addPlayer(state, 'a');
        const other = addPlayer(state, 'b');
        player.structureInventory.push('fabricator', 'power', 'guardTower');
        ownFootprint(state, 'a', 20, 20);
        ownFootprint(state, 'a', 30, 30);
        ownFootprint(state, 'a', 40, 40, 'guardTower');
        StructureSystem.place(state, player, 'fabricator', 20, 20);
        StructureSystem.place(state, player, 'power', 30, 30);
        StructureSystem.place(state, player, 'guardTower', 40, 40);
        expect(player.tileCap).toBe(BASE_TILE_CAP);
        addStructure(state, 'a', 50, 50, 'farm');
        StructureSystem.refreshOwner(state, 'a');
        expect(player.tileCap).toBe(BASE_TILE_CAP + TILES_PER_FARM);
        expect(other.tileCap).toBe(BASE_TILE_CAP);
    });

    it('losing a farm lowers the limit but never takes hexes away', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        const farm = addStructure(state, 'a', 20, 20, 'farm');
        StructureSystem.refreshOwner(state, 'a');
        player.tilesOwned = 900;
        StructureSystem.applyDamage(state, farm.id, 1000);
        expect(state.structures.has(farm.id)).toBe(false);
        expect(player.tileCap).toBe(BASE_TILE_CAP);
        expect(player.tilesOwned).toBe(900); // over the limit, keeps them
    });

    it('hasFabricator is true only while one of yours stands', () => {
        const state = world();
        addPlayer(state, 'a');
        expect(StructureSystem.hasFabricator(state, 'a')).toBe(false);
        addStructure(state, 'a', 20, 20, 'farm');
        expect(StructureSystem.hasFabricator(state, 'a')).toBe(false);
        const fab = addStructure(state, 'a', 30, 30, 'fabricator');
        addStructure(state, 'b', 40, 40, 'fabricator');
        expect(StructureSystem.hasFabricator(state, 'a')).toBe(true);
        StructureSystem.applyDamage(state, fab.id, 1000);
        expect(StructureSystem.hasFabricator(state, 'a')).toBe(false);
    });

    it('syncs hasFabricator to the player as fabricators are placed and destroyed', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        player.structureInventory.push('fabricator');
        ownFootprint(state, 'a', 20, 20);
        expect(player.hasFabricator).toBe(false);
        StructureSystem.place(state, player, 'fabricator', 20, 20);
        expect(player.hasFabricator).toBe(true);
        StructureSystem.applyDamage(state, 'struct-20-20', 1000);
        expect(player.hasFabricator).toBe(false);
    });
});

describe('StructureSystem — the Guard Tower limit', () => {
    it('is 10 on the default Small map, and bigger on bigger maps', () => {
        expect(MAP_SIZES.small.maxGuardTowers).toBe(10);
        expect(DEFAULT_GAME_SETTINGS.mapSize).toBe('small');
        expect(maxGuardTowers('small')).toBe(10);
        expect(maxGuardTowers('big')).toBeGreaterThan(maxGuardTowers('small'));
        expect(maxGuardTowers('large')).toBeGreaterThan(maxGuardTowers('big'));
        expect(maxGuardTowers('nonsense')).toBe(10); // falls back to Small's
    });

    it('counts standing towers and held ones together', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        for (let i = 0; i < 4; i++) addStructure(state, 'a', 10 + 4 * i, 10, 'guardTower');
        addStructure(state, 'b', 50, 50, 'guardTower'); // someone else's doesn't count
        player.structureInventory.push('guardTower', 'guardTower', 'farm');
        expect(StructureSystem.towerCount(state, player)).toBe(6);
    });

    it('lets you hold towers only up to the limit, and never limits other structures', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        for (let i = 0; i < 9; i++) player.structureInventory.push('guardTower');
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(true); // 9 of 10
        player.structureInventory.push('guardTower');
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(false); // 10 of 10
        for (const type of ['farm', 'fabricator', 'power'] as const) {
            expect(StructureSystem.canHold(state, player, type)).toBe(true);
        }
    });

    it('placing a tower does not free or use up room: the limit counts it either way', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        for (let i = 0; i < 9; i++) addStructure(state, 'a', 6 + 4 * i, 6, 'guardTower');
        player.structureInventory.push('guardTower');
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(false); // 9 + 1 held
        ownFootprint(state, 'a', 20, 30, 'guardTower');
        expect(StructureSystem.place(state, player, 'guardTower', 20, 30)).toBe(true);
        expect(StructureSystem.towerCount(state, player)).toBe(10);
        expect(player.towersBuilt).toBe(10);
    });

    it('a bigger map allows more', () => {
        const state = world();
        state.settings.mapSize = 'big';
        const player = addPlayer(state, 'a');
        for (let i = 0; i < 10; i++) player.structureInventory.push('guardTower');
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(true);
    });

    it('a destroyed tower makes room again', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        for (let i = 0; i < 10; i++) addStructure(state, 'a', 6 + 4 * i, 6, 'guardTower');
        StructureSystem.refreshOwner(state, 'a');
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(false);
        StructureSystem.applyDamage(state, 's-6-6', 500);
        expect(player.towersBuilt).toBe(9);
        expect(StructureSystem.canHold(state, player, 'guardTower')).toBe(true);
    });
});
