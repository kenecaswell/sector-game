import { describe, expect, it } from 'vitest';
import {
    INPUT_STALE_MS,
    MAP_EDGE_MARGIN,
    PLAYER_RADIUS,
    PLAYER_SPEED,
    SCREEN_Y_SCALE as SQ,
} from '../constants';
import { hexCenter, mapPixelSize, structureContact } from '../hex';
import { BOOSTER_SPEED_PER_LEVEL } from '../types/shared';
import {
    DT,
    addPlayer,
    addStructure,
    drive,
    inputs,
    onScreenSpeed,
    runMovement,
    world,
} from '../test/world';
import { MovementSystem } from './MovementSystem';

describe('MovementSystem — speed', () => {
    it('eases up to top speed within 5 ticks, then holds it', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        const input = inputs({ a: { x: 1, y: 0 } });
        const ramp: number[] = [];
        for (let i = 0; i < 10; i++) {
            MovementSystem.update(state, input, DT);
            ramp.push(onScreenSpeed(player));
        }
        const ticksToTop = ramp.findIndex((v) => v >= PLAYER_SPEED - 0.01) + 1;
        expect(ticksToTop).toBeGreaterThanOrEqual(2);
        expect(ticksToTop).toBeLessThanOrEqual(5);
        expect(onScreenSpeed(drive({ x: 1, y: 0 }, 20))).toBeCloseTo(PLAYER_SPEED, 0);
    });

    it.each([
        ['right', 1, 0],
        ['up', 0, -1],
        ['down', 0, 1],
        ['up-right', Math.SQRT1_2, -Math.SQRT1_2],
    ])('top speed is the same on screen in every direction: %s', (_label, sx, sy) => {
        // What the client sends: the on-screen direction converted to world space (y / SQ).
        expect(onScreenSpeed(drive({ x: sx, y: sy / SQ }, 20))).toBeCloseTo(PLAYER_SPEED, 0);
    });

    it('a half-pushed stick walks at half speed', () => {
        expect(onScreenSpeed(drive({ x: 0, y: -0.5 / SQ }, 20))).toBeCloseTo(PLAYER_SPEED / 2, 0);
    });

    it('clamps an oversized input vector to top speed', () => {
        expect(onScreenSpeed(drive({ x: 1, y: 1 / SQ }, 20))).toBeLessThanOrEqual(
            PLAYER_SPEED + 0.5
        );
    });

    it.each([1, 2, 3])('an equipped Booster %i adds 25% of normal top speed per level', (level) => {
        const state = world();
        const player = addPlayer(state, 'r');
        player.boosterLevel = level;
        player.equippedUpgrade = 'booster';
        runMovement(state, inputs({ r: { x: 1, y: 0 } }), 30);
        expect(onScreenSpeed(player)).toBeCloseTo(
            PLAYER_SPEED * (1 + BOOSTER_SPEED_PER_LEVEL * level),
            0
        );
    });

    it("an owned Booster that isn't equipped does nothing", () => {
        const state = world();
        const player = addPlayer(state, 'r');
        player.boosterLevel = 3;
        runMovement(state, inputs({ r: { x: 1, y: 0 } }), 30);
        expect(onScreenSpeed(player)).toBeCloseTo(PLAYER_SPEED, 0);
    });

    it('an equipped Jetpack is as fast as Booster 1 (+33%)', () => {
        const state = world();
        const player = addPlayer(state, 'r');
        player.wingsLevel = 1;
        player.equippedUpgrade = 'wings';
        runMovement(state, inputs({ r: { x: 1, y: 0 } }), 30);
        expect(onScreenSpeed(player)).toBeCloseTo(PLAYER_SPEED * 1.33, 0);
    });

    it('drops stale input: a player whose client went silent coasts to a stop', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        const input = inputs({ a: { x: 1, y: 0 } });
        for (let i = 0; i < 10; i++) MovementSystem.update(state, input, DT);
        input.get('a')!.receivedAt = Date.now() - (INPUT_STALE_MS + 1000);
        for (let i = 0; i < 12; i++) MovementSystem.update(state, input, DT);
        expect(onScreenSpeed(player)).toBe(0);
    });

    it('nobody moves outside the playing phase', () => {
        const player = drive({ x: 1, y: 0 }, 20, { phase: 'countdown' });
        expect(player.x).toBe(1500);
        expect(player.vx).toBe(0);
    });

    it('disconnected players stay frozen', () => {
        const state = world();
        const player = addPlayer(state, 'a');
        player.connected = false;
        runMovement(state, inputs({ a: { x: 1, y: 0 } }), 20);
        expect(player.x).toBe(1500);
    });
});

describe('MovementSystem — map edges', () => {
    const size = mapPixelSize(64, 64);

    it('stops players MAP_EDGE_MARGIN inside every edge', () => {
        expect(drive({ x: -1, y: 0 }, 400, { start: [100, 1500] }).x).toBe(MAP_EDGE_MARGIN);
        expect(drive({ x: 0, y: -1 / SQ }, 400, { start: [1500, 100] }).y).toBe(MAP_EDGE_MARGIN);
        expect(drive({ x: 1, y: 0 }, 400, { start: [size.width - 100, 1500] }).x).toBe(
            size.width - MAP_EDGE_MARGIN
        );
        expect(drive({ x: 0, y: 1 / SQ }, 400, { start: [1500, size.height - 100] }).y).toBe(
            size.height - MAP_EDGE_MARGIN
        );
    });
});

describe('MovementSystem — structures', () => {
    /** Walk player 'a' (on `playerTeam`) into a structure owned by 'o' (on `ownerTeam`). */
    const walkInto = (ownerTeam: string, playerTeam = 'red', ownerId = 'o') => {
        const state = world();
        const target = hexCenter(30, 30);
        const player = addPlayer(state, 'a', target.x - 150, target.y, playerTeam);
        if (ownerId !== 'a') addPlayer(state, ownerId, 0, 0, ownerTeam);
        addStructure(state, ownerId, 30, 30);
        runMovement(state, inputs({ a: { x: 1, y: 0 } }), 20);
        return player.x - target.x;
    };

    it("blocks enemies at the structure's edge", () => {
        expect(walkInto('blue')).toBeLessThan(-PLAYER_RADIUS + 1);
    });

    it('lets the owner and teammates walk straight through', () => {
        expect(walkInto('', 'red', 'a')).toBeGreaterThan(0);
        expect(walkInto('red')).toBeGreaterThan(0);
    });

    it("doesn't count two teamless players as teammates", () => {
        expect(walkInto('', '')).toBeLessThan(-PLAYER_RADIUS + 1);
    });

    it('lets a player caught inside a structure walk out', () => {
        const state = world();
        const center = hexCenter(10, 10);
        const player = addPlayer(state, 'enemy', center.x, center.y);
        addStructure(state, 'owner', 10, 10);
        runMovement(state, inputs({ enemy: { x: 1, y: 0 } }), 40);
        expect(player.x).toBeGreaterThan(center.x + 40);
    });

    // From every direction and offset, holding the input for a long time: enemies must slide around
    // the hexagon, never overlap it, and never freeze while still pushing sideways.
    it('enemies slide around it from 792 approaches: no overlaps, nobody stuck', () => {
        const center = hexCenter(10, 10);
        let overlaps = 0;
        let frozen = 0;
        let closest = Infinity;
        let approaches = 0;
        for (let angle = 0; angle < 360; angle += 15) {
            for (let offset = -130; offset <= 130; offset += 8) {
                const a = (angle * Math.PI) / 180;
                const dir = { x: Math.cos(a), y: Math.sin(a) };
                const state = world('playing', { tiles: false });
                addStructure(state, 'owner', 10, 10);
                const player = addPlayer(
                    state,
                    'enemy',
                    center.x - dir.x * 260 - dir.y * offset,
                    center.y - dir.y * 260 + dir.x * offset
                );
                const input = inputs({ enemy: dir });
                let lastMoved = 0;
                let previous = { x: player.x, y: player.y };
                for (let tick = 0; tick < 160; tick++) {
                    runMovement(state, input, 1);
                    closest = Math.min(
                        closest,
                        structureContact(player.x, player.y, {
                            type: 'farm',
                            tileX: 10,
                            tileY: 10,
                            rotation: 0,
                        }).distance
                    );
                    if (Math.hypot(player.x - previous.x, player.y - previous.y) > 0.5)
                        lastMoved = tick;
                    previous = { x: player.x, y: player.y };
                }
                approaches++;
                const contact = structureContact(player.x, player.y, {
                    type: 'farm',
                    tileX: 10,
                    tileY: 10,
                    rotation: 0,
                });
                if (contact.distance < PLAYER_RADIUS - 0.5) overlaps++;
                const mid = player.x > 50 && player.x < 3000 && player.y > 50 && player.y < 3500;
                if (lastMoved < 150 && mid) {
                    const sideways = Math.abs(dir.x * -contact.ny + dir.y * contact.nx);
                    if (sideways > 0.1) frozen++;
                }
            }
        }
        expect(approaches).toBe(792);
        expect(overlaps).toBe(0);
        expect(frozen).toBe(0);
        expect(closest).toBeGreaterThanOrEqual(PLAYER_RADIUS - 0.5);
    });
});
