import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, EXPANDER_CLAIM_RADII } from '../constants';
import { TILE_LIMIT_NOTICE_INTERVAL_MS } from '../constants';
import { EXPANDER_HEXES } from '../types/shared';
import {
    STRUCTURE_CORNER_OFFSETS,
    hexCenter,
    mapPixelSize,
    pixelToHex,
    structureFootprint,
} from '../hex';
import type { GameState, Player } from '../state/GameState';
import { addPlayer, addPlayerAt, addStructure, ownFootprint, tileAt, world } from '../test/world';
import type { TilesClaimedEvent } from '../types/shared';
import { CollisionSystem } from './CollisionSystem';

function claimOnce(state: GameState, player: Player): TilesClaimedEvent['tiles'] {
    const claimed: TilesClaimedEvent['tiles'] = [];
    CollisionSystem.claimTiles(state, player, claimed);
    return claimed;
}

describe('CollisionSystem — claiming', () => {
    it('at the base radius on a hex center: claims exactly that hex', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        expect(claimOnce(state, p)).toEqual([{ x: 20, y: 20, ownerId: 'a' }]);
        expect(p.tilesOwned).toBe(1);
    });

    it('with the Harvester on a hex center: claims it and all 6 neighbors', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.claimRadius = EXPANDER_CLAIM_RADII[0];
        expect(claimOnce(state, p)).toHaveLength(7);
    });

    it.each([1, 2, 3])(
        'Harvester %i on a hex center claims EXPANDER_HEXES (7 / 19 / 37)',
        (level) => {
            const state = world();
            const p = addPlayerAt(state, 'a', 30, 30);
            p.claimRadius = EXPANDER_CLAIM_RADII[level - 1];
            expect(claimOnce(state, p)).toHaveLength(EXPANDER_HEXES[level - 1]);
        }
    );

    it('claims exactly what a brute-force scan says, from 1,600 random spots incl. the edges', () => {
        const size = mapPixelSize(64, 64);
        // One world, reset between trials (building 800 worlds of 4,096 tiles is slow).
        const state = world();
        const p = addPlayer(state, 'a');
        let mismatches = 0;
        for (const radius of [BASE_CLAIM_RADIUS, ...EXPANDER_CLAIM_RADII]) {
            for (let n = 0; n < 400; n++) {
                p.x = Math.random() * size.width;
                p.y = Math.random() * size.height;
                p.claimRadius = radius;
                const claimed = claimOnce(state, p);
                for (const t of claimed) tileAt(state, t.x, t.y).ownerId = '';
                p.tilesOwned = 0;
                const got = new Set(claimed.map((t) => t.y * 64 + t.x));
                const want = new Set<number>();
                const under = pixelToHex(p.x, p.y);
                if (under.col >= 0 && under.row >= 0 && under.col < 64 && under.row < 64) {
                    want.add(under.row * 64 + under.col);
                }
                for (let r = 0; r < 64; r++) {
                    for (let c = 0; c < 64; c++) {
                        const ce = hexCenter(c, r);
                        if (Math.hypot(ce.x - p.x, ce.y - p.y) <= radius) want.add(r * 64 + c);
                    }
                }
                if (got.size !== want.size || [...want].some((i) => !got.has(i))) mismatches++;
            }
        }
        expect(mismatches).toBe(0);
    });

    it("steals enemies' hexes, keeping both players' tile counts right, and is idempotent", () => {
        const state = world();
        const victim = addPlayer(state, 'v', 0, 0);
        for (const [c, r] of [
            [21, 20],
            [19, 20],
        ]) {
            tileAt(state, c, r).ownerId = 'v';
            victim.tilesOwned++;
        }
        const p = addPlayerAt(state, 'a', 20, 20);
        p.claimRadius = EXPANDER_CLAIM_RADII[0];
        claimOnce(state, p);
        expect(victim.tilesOwned).toBe(0);
        expect(p.tilesOwned).toBe(7);
        expect(state.tiles.filter((t) => t.ownerId === 'a')).toHaveLength(7);
        expect(claimOnce(state, p)).toHaveLength(0);
    });

    it("leaves teammates' hexes alone", () => {
        const state = world();
        const mate = addPlayer(state, 'm', 0, 0, 'red');
        const foe = addPlayer(state, 'f', 0, 0, 'blue');
        tileAt(state, 21, 20).ownerId = 'm';
        mate.tilesOwned = 1;
        tileAt(state, 19, 20).ownerId = 'f';
        foe.tilesOwned = 1;
        const p = addPlayerAt(state, 'a', 20, 20, 'red');
        p.claimRadius = EXPANDER_CLAIM_RADII[0];
        claimOnce(state, p);
        expect(tileAt(state, 21, 20).ownerId).toBe('m');
        expect(mate.tilesOwned).toBe(1);
        expect(tileAt(state, 19, 20).ownerId).toBe('a');
        expect(foe.tilesOwned).toBe(0);
        expect(p.tilesOwned).toBe(6);
    });

    it("can't claim any of the 7 hexes under an enemy's structure", () => {
        const state = world();
        addPlayer(state, 'o', 0, 0);
        ownFootprint(state, 'o', 30, 30);
        addStructure(state, 'o', 30, 30);
        const footprint = new Set(structureFootprint(30, 30).map((h) => `${h.col},${h.row}`));
        const foe = addPlayer(state, 'f');
        foe.claimRadius = EXPANDER_CLAIM_RADII[0];
        for (const h of structureFootprint(30, 30)) {
            const c = hexCenter(h.col, h.row);
            foe.x = c.x;
            foe.y = c.y;
            const claimed = claimOnce(state, foe);
            expect(claimed.some((t) => footprint.has(`${t.x},${t.y}`))).toBe(false);
        }
    });

    it('batches a tick of claims into one tilesClaimed broadcast, only during play', () => {
        const state = world();
        addPlayerAt(state, 'a', 10, 10);
        addPlayerAt(state, 'b', 30, 30);
        const sent: unknown[] = [];
        CollisionSystem.update(state, (type, payload) => sent.push([type, payload]));
        expect(sent).toHaveLength(1);
        expect((sent[0] as [string, TilesClaimedEvent])[1].tiles).toHaveLength(2);
        const lobby = world('lobby');
        addPlayerAt(lobby, 'a', 10, 10);
        CollisionSystem.update(lobby, (type, payload) => sent.push([type, payload]));
        expect(sent).toHaveLength(1);
    });

    it("doesn't claim for disconnected players", () => {
        const state = world();
        addPlayerAt(state, 'a', 10, 10).connected = false;
        CollisionSystem.update(state, () => {});
        expect(tileAt(state, 10, 10).ownerId).toBe('');
    });
});

describe('CollisionSystem — shots against structures', () => {
    it('hits anywhere inside the hexagon and nowhere outside it', () => {
        const structure = { type: 'farm', tileX: 30, tileY: 30, rotation: 0 };
        const c = hexCenter(30, 30);
        for (const o of STRUCTURE_CORNER_OFFSETS) {
            const inside = { x: c.x + o.x * 0.95, y: c.y + o.y * 0.95 };
            const outside = { x: c.x + o.x * 1.05, y: c.y + o.y * 1.05 };
            expect(CollisionSystem.checkProjectileStructureCollision(inside, structure)).toBe(true);
            expect(CollisionSystem.checkProjectileStructureCollision(outside, structure)).toBe(
                false
            );
        }
    });
});

describe('CollisionSystem — the tile limit', () => {
    it('at the limit, walking over unclaimed ground claims nothing and says so', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.tilesOwned = p.tileCap;
        const claimed: TilesClaimedEvent['tiles'] = [];
        expect(CollisionSystem.claimTiles(state, p, claimed)).toBe(true);
        expect(claimed).toEqual([]);
        expect(tileAt(state, 20, 20).ownerId).toBe('');
        expect(p.tilesOwned).toBe(p.tileCap);
        expect(p.materials).toBe(0);
    });

    it('one under the limit claims one more, then stops', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.tilesOwned = p.tileCap - 1;
        expect(claimOnce(state, p)).toHaveLength(1);
        expect(p.tilesOwned).toBe(p.tileCap);
        const next = hexCenter(21, 20);
        p.x = next.x;
        p.y = next.y;
        expect(claimOnce(state, p)).toHaveLength(0);
        expect(tileAt(state, 21, 20).ownerId).toBe('');
    });

    it('is not blocked by the limit when nothing was left to claim', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        tileAt(state, 20, 20).ownerId = 'a';
        p.tilesOwned = p.tileCap;
        expect(CollisionSystem.claimTiles(state, p, [])).toBe(false);
    });

    it('the Harvester takes only as many as fit, the hex under you first', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.claimRadius = EXPANDER_CLAIM_RADII[0];
        p.tilesOwned = p.tileCap - 3;
        const claimed = claimOnce(state, p);
        expect(claimed).toHaveLength(3);
        expect(claimed[0]).toEqual({ x: 20, y: 20, ownerId: 'a' });
        expect(p.tilesOwned).toBe(p.tileCap);
    });

    it("also stops you stealing an enemy's hexes, so the enemy keeps them", () => {
        const state = world();
        const victim = addPlayer(state, 'v', 0, 0);
        tileAt(state, 20, 20).ownerId = 'v';
        victim.tilesOwned = 1;
        const p = addPlayerAt(state, 'a', 20, 20);
        p.tilesOwned = p.tileCap;
        claimOnce(state, p);
        expect(tileAt(state, 20, 20).ownerId).toBe('v');
        expect(victim.tilesOwned).toBe(1);
    });

    it('a farm raises the limit, so claiming carries on', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.tilesOwned = p.tileCap;
        expect(claimOnce(state, p)).toHaveLength(0);
        p.tileCap += 500;
        expect(claimOnce(state, p)).toHaveLength(1);
    });

    it('tells the player once, then again only after the interval', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 20, 20);
        p.tilesOwned = p.tileCap;
        const told: unknown[][] = [];
        const notify = (id: string, type: string, payload: unknown) =>
            told.push([id, type, payload]);
        const noop = () => {};
        CollisionSystem.update(state, noop, notify, 100_000);
        CollisionSystem.update(state, noop, notify, 100_050);
        expect(told).toEqual([['a', 'tileLimitReached', { limit: p.tileCap }]]);
        CollisionSystem.update(state, noop, notify, 100_000 + TILE_LIMIT_NOTICE_INTERVAL_MS);
        expect(told).toHaveLength(2);
    });

    it('does not tell a player who is under the limit', () => {
        const state = world();
        addPlayerAt(state, 'a', 20, 20);
        const told: unknown[] = [];
        CollisionSystem.update(
            state,
            () => {},
            (...args) => told.push(args),
            100_000
        );
        expect(told).toEqual([]);
    });
});
