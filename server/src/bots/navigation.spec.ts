import { describe, expect, it } from 'vitest';
import {
    compactFootprint,
    hexDistance,
    hexIndex,
    hexNeighbors,
    inStructureFootprint,
} from '../hex';
import { Pickup } from '../state/GameState';
import { addPlayerAt, addStructure, ownFootprint, setTerrain, tileAt, world } from '../test/world';
import { TERRAIN } from '../types/shared';
import { claimValue, findBuildSite, planClaimRoute, planRouteToward } from './navigation';

const noBlocks = new Set<number>();
const calm = { depth: 10, noise: 0, random: () => 0 };

describe('claimValue', () => {
    it('values fresh ground most, then re-takes and enemy hexes; its own, terrain and protected hexes nothing', () => {
        const state = world('playing', { teams: true });
        addPlayerAt(state, 'bot', 10, 10, 'red');
        addPlayerAt(state, 'mate', 20, 20, 'red');
        addPlayerAt(state, 'foe', 30, 30, 'blue');
        const at = (col: number, row: number) => hexIndex(col, row, state.mapWidth);
        tileAt(state, 1, 1).claimedBefore = true;
        tileAt(state, 2, 2).ownerId = 'foe';
        tileAt(state, 3, 3).ownerId = 'bot';
        tileAt(state, 4, 4).ownerId = 'mate';
        setTerrain(state, TERRAIN.mountain, [[5, 5]]);
        expect(claimValue(state, at(0, 0), 'bot', noBlocks)).toBe(3);
        expect(claimValue(state, at(1, 1), 'bot', noBlocks)).toBe(2);
        expect(claimValue(state, at(2, 2), 'bot', noBlocks)).toBe(2);
        expect(claimValue(state, at(3, 3), 'bot', noBlocks)).toBe(0);
        expect(claimValue(state, at(4, 4), 'bot', noBlocks)).toBe(0);
        expect(claimValue(state, at(5, 5), 'bot', noBlocks)).toBe(0);
        expect(claimValue(state, at(0, 0), 'bot', new Set([at(0, 0)]))).toBe(0);
    });
});

describe('planClaimRoute', () => {
    it('heads for the nearest unclaimed ground', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        const route = planClaimRoute(state, bot, calm);
        expect(route).toHaveLength(1); // a neighbor
    });

    it('goes out of its way for a drop pod', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        const pod = new Pickup();
        pod.id = 'pod';
        pod.tileX = 24;
        pod.tileY = 20;
        state.pickups.set(pod.id, pod);
        const route = planClaimRoute(state, bot, calm);
        expect(route[route.length - 1]).toEqual({ col: 24, row: 20 });
    });

    it('deep in its own territory, walks toward the nearest ground that is still worth claiming', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        for (let row = 0; row < 64; row++) {
            for (let col = 0; col < 64; col++) {
                if (col < 50) tileAt(state, col, row).ownerId = 'bot';
            }
        }
        const route = planClaimRoute(state, bot, { ...calm, depth: 6 });
        expect(route).toHaveLength(30); // beyond what it looks at for claiming ...
        expect(route[29].col).toBe(50); // ... to the nearest unclaimed ground
    });

    it('...walking around a wall rather than getting stuck against it', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        for (const tile of state.tiles) tile.ownerId = 'bot';
        tileAt(state, 24, 20).ownerId = ''; // just behind a wall ...
        const wall: Array<[number, number]> = [];
        for (let row = 10; row <= 30; row++) wall.push([22, row]);
        setTerrain(state, TERRAIN.mountain, wall);
        tileAt(state, 10, 20).ownerId = ''; // ... and further away but on this side
        const route = planClaimRoute(state, bot, { ...calm, depth: 3 });
        expect(route[route.length - 1]).toEqual({ col: 10, row: 20 }); // the one it can walk to first
    });
});

describe('planRouteToward', () => {
    it('walks around a mountain wall through its gap, never over a mountain', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 10, 20);
        // A wall down column 15 from row 5 to 35, except a gap at row 30.
        const wall: Array<[number, number]> = [];
        for (let row = 5; row <= 35; row++) if (row !== 30) wall.push([15, row]);
        setTerrain(state, TERRAIN.mountain, wall);
        const route = planRouteToward(state, bot, { col: 20, row: 20 }, 40);
        expect(route[route.length - 1]).toEqual({ col: 20, row: 20 });
        expect(route.some((h) => h.col === 15 && h.row === 30)).toBe(true);
        expect(route.every((h) => tileAt(state, h.col, h.row).terrain === TERRAIN.ground)).toBe(
            true
        );
    });

    it("never walks into an enemy's structure, but may walk over a teammate's", () => {
        const state = world('playing', { teams: true });
        const bot = addPlayerAt(state, 'bot', 10, 20, 'red');
        addPlayerAt(state, 'foe', 50, 50, 'blue');
        addPlayerAt(state, 'mate', 50, 10, 'red');
        addStructure(state, 'foe', 14, 20);
        const route = planRouteToward(state, bot, { col: 14, row: 20 }, 20);
        expect(route.some((h) => inStructureFootprint(h.col, h.row, 14, 20))).toBe(false);
        expect(route[route.length - 1]).not.toEqual({ col: 14, row: 20 });
        state.structures.clear();
        addStructure(state, 'mate', 14, 20);
        const over = planRouteToward(state, bot, { col: 14, row: 20 }, 20);
        expect(over[over.length - 1]).toEqual({ col: 14, row: 20 });
    });

    it('gets as close as it can when the goal is out of reach', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 10, 20);
        const route = planRouteToward(state, bot, { col: 40, row: 20 }, 5);
        expect(route).toHaveLength(5);
        expect(route[4].col).toBe(15);
    });
});

describe('findBuildSite', () => {
    it('finds a spot it already owns all 7 hexes of', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        for (let row = 17; row <= 23; row++) {
            for (let col = 17; col <= 23; col++) tileAt(state, col, row).ownerId = 'bot';
        }
        const site = findBuildSite(state, bot, 3, 'farm');
        expect(site?.missing).toEqual([]);
    });

    it('otherwise the spot needing the fewest hexes, skipping terrain and existing structures', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        tileAt(state, 20, 20).ownerId = 'bot';
        const site = findBuildSite(state, bot, 2, 'farm')!;
        expect(site.center).toEqual({ col: 20, row: 20 });
        expect(site.missing).toHaveLength(6);

        setTerrain(state, TERRAIN.water, [[20, 21]]);
        addStructure(state, 'bot', 22, 18);
        const moved = findBuildSite(state, bot, 2, 'farm')!;
        for (const hex of [moved.center, ...moved.missing]) {
            expect(tileAt(state, hex.col, hex.row).terrain).toBe(TERRAIN.ground);
            expect(inStructureFootprint(hex.col, hex.row, 22, 18)).toBe(false);
        }
    });
});

describe('findBuildSite with maxMissing (a bot at its tile limit)', () => {
    it('finds only spots it already owns when it can claim nothing more', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        tileAt(state, 20, 20).ownerId = 'bot';
        expect(findBuildSite(state, bot, 2, 'farm', 0)).toBeNull();
        ownFootprint(state, 'bot', 21, 20);
        const site = findBuildSite(state, bot, 2, 'farm', 0);
        expect(site?.missing).toEqual([]);
    });
});

describe('findBuildSite for a Guard Tower', () => {
    it('wants just 3 touching hexes, and says which way to turn it', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 20, 20);
        for (const hex of compactFootprint(20, 20, 4))
            tileAt(state, hex.col, hex.row).ownerId = 'bot';
        const site = findBuildSite(state, bot, 1, 'guardTower', 0);
        expect(site).not.toBeNull();
        expect(site!.missing).toEqual([]);
        expect(site!.rotation).toBeGreaterThanOrEqual(0);
        // 7 owned hexes would be needed for a farm; 3 are not enough.
        expect(findBuildSite(state, bot, 1, 'farm', 0)).toBeNull();
    });
});

describe("bots and other players' spawn zones", () => {
    it("place no value on claiming hexes in someone else's spawn zone", () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 30, 30);
        bot.spawnTileX = 5;
        bot.spawnTileY = 5;
        const owner = addPlayerAt(state, 'owner', 33, 30);
        owner.spawnTileX = 33;
        owner.spawnTileY = 30;
        const route = planClaimRoute(state, bot, { depth: 6, noise: 0, random: () => 0 });
        const zone = new Set(
            [[33, 30], ...hexNeighbors(33, 30).map((h) => [h.col, h.row])].map(
                ([c, r]) => `${c},${r}`
            )
        );
        expect(route.length).toBeGreaterThan(0);
        // The goal is the last hex of the route, and it is never inside the zone.
        const goal = route[route.length - 1];
        expect(zone.has(`${goal.col},${goal.row}`)).toBe(false);
    });

    it('never pick a build site that needs hexes from another spawn zone', () => {
        const state = world();
        const bot = addPlayerAt(state, 'bot', 33, 30);
        bot.spawnTileX = 5;
        bot.spawnTileY = 5;
        const owner = addPlayerAt(state, 'owner', 40, 40);
        owner.spawnTileX = 33;
        owner.spawnTileY = 30;
        const site = findBuildSite(state, bot, 3, 'farm');
        expect(site).not.toBeNull();
        for (const hex of [site!.center, ...site!.missing]) {
            expect(hexDistance(hex, { col: 33, row: 30 })).toBeGreaterThan(1);
        }
    });
});
