// Step 2 of terrain: how mountains and water affect movement, claiming and shots.
// (Generation is covered in terrain.spec.ts.)
import { describe, expect, it } from 'vitest';
import { EXPANDER_CLAIM_RADII, PLAYER_RADIUS, SCREEN_Y_SCALE as SQ } from '../constants';
import { hexCenter, hexContact, hexNeighbors } from '../hex';
import {
    DT,
    addPlayer,
    addPlayerAt,
    addShot,
    inputs,
    runMovement,
    setTerrain,
    tileAt,
    world,
} from '../test/world';
import { TERRAIN, type Terrain } from '../types/shared';
import { CollisionSystem } from './CollisionSystem';
import { CombatSystem } from './CombatSystem';

const { mountain, water } = TERRAIN;

/** Walks a player east for `ticks` from 150px west of hex (col, row); returns x relative to it. */
function walkEastInto(
    terrain: Terrain,
    hexes: Array<[number, number]>,
    col = 30,
    row = 30,
    ticks = 30,
    upgrades: string[] = []
) {
    const state = world();
    setTerrain(state, terrain, hexes);
    const target = hexCenter(col, row);
    const player = addPlayer(state, 'a', target.x - 150, target.y);
    if (upgrades.includes('wings')) {
        player.wingsLevel = 1;
        player.equippedUpgrade = 'wings';
    }
    runMovement(state, inputs({ a: { x: 1, y: 0 } }), ticks);
    return player.x - target.x;
}

describe('terrain and movement', () => {
    it('mountains are solid: you stop at the edge', () => {
        const offset = walkEastInto(mountain, [[30, 30]]);
        expect(offset).toBeLessThan(-PLAYER_RADIUS); // still west of the hex's center, outside it
        expect(offset).toBeGreaterThan(-PLAYER_RADIUS - 40); // but right up against it
    });

    it('deep water is solid too (a lake: hexes with touching water neighbors)', () => {
        const lake: Array<[number, number]> = [
            [30, 30],
            ...hexNeighbors(30, 30).map((h) => [h.col, h.row] as [number, number]),
        ];
        expect(walkEastInto(water, lake)).toBeLessThan(-80); // stopped at the lake's west shore
    });

    it('shallow water (1 hex across) can be waded through', () => {
        // A 1-wide north-south river: each hex has water only directly above and below.
        const river: Array<[number, number]> = [28, 29, 30, 31, 32].map((row) => [30, row]);
        expect(walkEastInto(water, river)).toBeGreaterThan(50); // walked right across
    });

    it('pushes out a player who ends up inside terrain', () => {
        const state = world();
        setTerrain(state, mountain, [[20, 20]]);
        const player = addPlayerAt(state, 'a', 20, 20);
        runMovement(state, inputs({ a: { x: 0, y: 0 } }), 1);
        expect(hexContact(player.x, player.y, 20, 20).distance).toBeGreaterThanOrEqual(
            PLAYER_RADIUS - 0.01
        );
    });

    it('slides you along a zigzag wall instead of catching on its corners', () => {
        // A column of hexes: its west face zigzags. Push north-east into it and keep going north.
        const state = world();
        const wall: Array<[number, number]> = [];
        for (let row = 10; row <= 40; row++) wall.push([30, row]);
        setTerrain(state, mountain, wall);
        const start = hexCenter(29, 30);
        const player = addPlayer(state, 'a', start.x - 10, start.y);
        runMovement(state, inputs({ a: { x: 0.5, y: -1 / SQ } }), 40);
        expect(start.y - player.y).toBeGreaterThan(250); // made good progress north along it
        expect(player.x).toBeLessThan(hexCenter(30, 30).x - PLAYER_RADIUS); // never through it
    });

    it('never lets a player overlap terrain, from any direction (a lake and a mountain range)', () => {
        const center = hexCenter(32, 32);
        const blob: Array<[number, number]> = [[32, 32]];
        for (const h of hexNeighbors(32, 32)) {
            blob.push([h.col, h.row]);
            for (const n of hexNeighbors(h.col, h.row)) blob.push([n.col, n.row]); // 2 rings: 19 hexes
        }
        for (const terrain of [mountain, water]) {
            let worst = Infinity;
            // One world per terrain, reused (building 90 worlds of 4,096 tiles each is slow).
            const state = world();
            setTerrain(state, terrain, blob);
            const player = addPlayer(state, 'p');
            for (let angle = 0; angle < 360; angle += 20) {
                for (const offset of [-80, -40, 0, 40, 80]) {
                    const a = (angle * Math.PI) / 180;
                    const dir = { x: Math.cos(a), y: Math.sin(a) };
                    player.x = center.x - dir.x * 300 - dir.y * offset;
                    player.y = center.y - dir.y * 300 + dir.x * offset;
                    player.vx = 0;
                    player.vy = 0;
                    const input = inputs({ p: dir });
                    for (let t = 0; t < 120; t++) {
                        runMovement(state, input, 1);
                        for (const [col, row] of blob) {
                            worst = Math.min(
                                worst,
                                hexContact(player.x, player.y, col, row).distance
                            );
                        }
                    }
                }
            }
            expect(worst, `terrain ${terrain}`).toBeGreaterThan(PLAYER_RADIUS - 1);
        }
    });
});

describe('Wings', () => {
    const lake: Array<[number, number]> = [
        [30, 30],
        ...hexNeighbors(30, 30).map((h) => [h.col, h.row] as [number, number]),
    ];

    it('carry a player straight over a mountain and over deep water', () => {
        expect(walkEastInto(mountain, [[30, 30]], 30, 30, 30, ['wings'])).toBeGreaterThan(50);
        expect(walkEastInto(water, lake, 30, 30, 30, ['wings'])).toBeGreaterThan(50);
    });

    it("still don't let you claim terrain you fly over", () => {
        const state = world();
        setTerrain(state, mountain, [[20, 20]]);
        const player = addPlayerAt(state, 'a', 20, 20);
        player.wingsLevel = 1;
        player.equippedUpgrade = 'wings';
        CollisionSystem.claimTiles(state, player, []);
        expect(tileAt(state, 20, 20).ownerId).toBe('');
    });
});

describe('terrain and claiming', () => {
    it('nobody claims mountain or water, even with the Expander over them', () => {
        const state = world();
        const terrainHexes = hexNeighbors(20, 20).map((h) => [h.col, h.row] as [number, number]);
        setTerrain(state, mountain, terrainHexes.slice(0, 3));
        setTerrain(state, water, terrainHexes.slice(3));
        const player = addPlayerAt(state, 'a', 20, 20);
        player.claimRadius = EXPANDER_CLAIM_RADII[0];
        const claimed: Array<{ x: number; y: number }> = [];
        CollisionSystem.claimTiles(state, player, claimed as never);
        expect(claimed).toEqual([{ x: 20, y: 20, ownerId: 'a' }]); // only the ground hex
        for (const [col, row] of terrainHexes) expect(tileAt(state, col, row).ownerId).toBe('');
    });

    it("can't claim the shallow water you wade through either", () => {
        const state = world();
        setTerrain(state, water, [[20, 20]]);
        const player = addPlayerAt(state, 'a', 20, 20);
        CollisionSystem.claimTiles(state, player, []);
        expect(tileAt(state, 20, 20).ownerId).toBe('');
    });
});

describe('terrain and shots', () => {
    /** Fires east from 200px west of (col, row) at a target 150px east of it; true if it hit. */
    const shootAcross = (terrain: Terrain | null) => {
        const state = world();
        if (terrain !== null)
            setTerrain(state, terrain, [
                [30, 30],
                [30, 31],
                [30, 29],
            ]);
        const c = hexCenter(30, 30);
        const target = addPlayer(state, 't', c.x + 150, c.y);
        const shot = addShot(state, 's', c.x - 200, c.y, 0);
        for (let i = 0; i < 40 && state.projectiles.size > 0; i++)
            CombatSystem.update(state, DT, () => {});
        return { hit: target.health < 100, shot, state };
    };

    it('mountains stop shots, shielding whoever is behind them', () => {
        const { hit, state, shot } = shootAcross(mountain);
        expect(hit).toBe(false);
        expect(state.projectiles.has(shot.id)).toBe(false);
    });

    it('shots fly over water', () => {
        expect(shootAcross(water).hit).toBe(true);
        expect(shootAcross(null).hit).toBe(true); // (and over plain ground, of course)
    });

    it("doesn't skip a mountain's corner between ticks", () => {
        // Shots fired straight down the screen move ~33 world px per tick, and near a hex's left and
        // right points the hex is much thinner than that. Every shot whose path crosses the hex
        // must stop there, not pop out the other side.
        const c = hexCenter(30, 30);
        let passedThrough = 0;
        let crossings = 0;
        for (let dx = -31; dx <= 31; dx += 1) {
            const state = world();
            setTerrain(state, mountain, [[30, 30]]);
            const shot = addShot(state, 's', c.x + dx, c.y - 150, Math.PI / 2);
            crossings++;
            for (let i = 0; i < 40 && state.projectiles.has(shot.id); i++) {
                CombatSystem.update(state, DT, () => {});
            }
            if (state.projectiles.has(shot.id) || shot.y > c.y + 60) passedThrough++;
        }
        expect(crossings).toBe(63);
        expect(passedThrough).toBe(0);
    });
});
