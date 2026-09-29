import { describe, expect, it } from 'vitest';
import { hexNeighbors, structureFootprint } from '../hex';
import { addPlayer, addStructure, ownFootprint, tileAt, world } from '../test/world';
import { StructureSystem } from './StructureSystem';

describe('StructureSystem.canPlace', () => {
    it('allows a structure when all 7 footprint hexes are yours', () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        expect(StructureSystem.canPlace(state, 'a', 20, 20)).toBe(true);
        expect(StructureSystem.canPlace(state, 'b', 20, 20)).toBe(false);
    });

    it("refuses when even one of the 7 isn't yours (a teammate's included)", () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        const n = hexNeighbors(20, 20)[3];
        tileAt(state, n.col, n.row).ownerId = 'mate';
        expect(StructureSystem.canPlace(state, 'a', 20, 20)).toBe(false);
    });

    it('refuses at the map edge, where part of the footprint is off the map', () => {
        const state = world();
        for (let r = 0; r < 64; r++) {
            for (const c of [0, 1, 62, 63]) tileAt(state, c, r).ownerId = 'a';
        }
        for (let c = 0; c < 64; c++) tileAt(state, c, 0).ownerId = 'a';
        expect(StructureSystem.canPlace(state, 'a', 0, 10)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 5, 0)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 63, 30)).toBe(false);
    });

    it("refuses overlapping another structure's footprint, but allows touching it", () => {
        const state = world();
        ownFootprint(state, 'a', 20, 20);
        ownFootprint(state, 'a', 22, 20);
        ownFootprint(state, 'a', 23, 21);
        addStructure(state, 'a', 20, 20);
        expect(StructureSystem.canPlace(state, 'a', 20, 20)).toBe(false);
        expect(StructureSystem.canPlace(state, 'a', 22, 20)).toBe(false); // shares a hex
        const touching = structureFootprint(23, 21).every(
            (h) => !structureFootprint(20, 20).some((g) => g.col === h.col && g.row === h.row)
        );
        expect(touching).toBe(true);
        expect(StructureSystem.canPlace(state, 'a', 23, 21)).toBe(true);
    });
});

describe('StructureSystem.applyDamage', () => {
    it('lowers health, and removes and announces the structure at 0', () => {
        const state = world();
        const fort = addStructure(state, 'a', 10, 10);
        const events: unknown[] = [];
        StructureSystem.applyDamage(state, fort.id, 60, (type, payload) =>
            events.push([type, payload])
        );
        expect(fort.health).toBe(40);
        StructureSystem.applyDamage(state, fort.id, 60, (type, payload) =>
            events.push([type, payload])
        );
        expect(state.structures.has(fort.id)).toBe(false);
        expect(events).toEqual([['structureDestroyed', { structureId: fort.id }]]);
    });

    it('ignores an unknown structure', () => {
        expect(() => StructureSystem.applyDamage(world(), 'nope', 50)).not.toThrow();
    });
});

describe('StructureSystem.place', () => {
    it('places one from the inventory where canPlace allows, using it up', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        player.structureInventory.push('farm', 'fort');
        expect(StructureSystem.place(state, player, 'fort', 20, 20)).toBe(false); // not theirs yet
        ownFootprint(state, 'a', 20, 20);
        expect(StructureSystem.place(state, player, 'power', 20, 20)).toBe(false); // none held
        expect(StructureSystem.place(state, player, 'fort', 20, 20)).toBe(true);
        expect(Array.from(player.structureInventory)).toEqual(['farm']);
        expect(Array.from(state.structures.values())).toMatchObject([
            { ownerId: 'a', tileX: 20, tileY: 20, type: 'fort' },
        ]);
        state.phase.phase = 'results';
        ownFootprint(state, 'a', 30, 30);
        expect(StructureSystem.place(state, player, 'farm', 30, 30)).toBe(false);
    });
});
