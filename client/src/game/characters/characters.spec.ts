import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS } from '../../types/shared';
import { recorder } from '../../test/brush';
import {
    CHARACTER_FRAME,
    DIRECTIONS,
    JETPACK_LIFT,
    LEGS_FRAME,
    STANDING,
    STRIDE_FRAMES,
    bakeBody,
    bakeLegs,
    bodyTextureKey,
    characterIdOf,
    drawBody,
    drawCharacter,
    drawLegs,
    legsTextureKey,
    strideFrame,
    loadoutOf,
    nearestDirection,
    type CharacterLoadout,
} from './index';
import { HARVESTER_CELLS } from './upgrades';

const draw = (
    id: (typeof CHARACTER_IDS)[number],
    direction: number,
    loadout?: CharacterLoadout,
    shadow = true
) => {
    const r = recorder();
    drawCharacter(r.brush, 0, 0, id, DIRECTIONS[direction].angle, loadout, shadow);
    return r;
};

const bounds = (points: { x: number; y: number }[]) => ({
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
});

describe('character art', () => {
    it.each(CHARACTER_IDS)('%s draws a lot, the same way every time', (id) => {
        const a = draw(id, 4);
        expect(a.calls.length).toBeGreaterThan(100);
        expect(draw(id, 4).calls).toEqual(a.calls);
    });

    it.each(CHARACTER_IDS)('%s looks different from every direction', (id) => {
        const looks = DIRECTIONS.map((_, i) => draw(id, i).calls.join('\n'));
        expect(new Set(looks).size).toBe(DIRECTIONS.length);
    });

    it('every character is drawn in a different look', () => {
        const looks = CHARACTER_IDS.map((id) => draw(id, 4).calls.join('\n'));
        expect(new Set(looks).size).toBe(CHARACTER_IDS.length);
    });

    it.each(CHARACTER_IDS)('%s fits its frame in every direction, with every upgrade', (id) => {
        const loadouts: CharacterLoadout[] = [
            {},
            { equipped: 'booster', level: 3, armor: 3 },
            { equipped: 'expander', level: 3, armor: 3 },
            { equipped: 'wings', level: 1, armor: 3 },
        ];
        const { width, height, originX, originY } = CHARACTER_FRAME;
        for (const loadout of loadouts) {
            for (let d = 0; d < DIRECTIONS.length; d++) {
                const box = bounds(draw(id, d, loadout).points);
                expect(box.left).toBeGreaterThanOrEqual(-originX);
                expect(box.right).toBeLessThanOrEqual(width - originX);
                expect(box.top).toBeGreaterThanOrEqual(-originY);
                expect(box.bottom).toBeLessThanOrEqual(height - originY);
            }
        }
    });

    it('stands on the ground: nothing is drawn below the feet and shadow', () => {
        for (const id of CHARACTER_IDS) {
            for (let d = 0; d < DIRECTIONS.length; d++) {
                expect(bounds(draw(id, d).points).bottom).toBeLessThan(20);
            }
        }
    });

    it('leaves the shadow out when asked', () => {
        const withShadow = draw('farmer', 4);
        const without = draw('farmer', 4, {}, false);
        expect(withShadow.calls.filter((c) => c.startsWith('ellipse '))).toHaveLength(
            without.calls.filter((c) => c.startsWith('ellipse ')).length + 2
        );
    });

    describe('upgrades', () => {
        it.each(CHARACTER_IDS)('%s shows each upgrade it has on', (id) => {
            const base = draw(id, 7).calls.join('\n');
            const loadouts: CharacterLoadout[] = [
                { equipped: 'booster', level: 1 },
                { equipped: 'expander', level: 1 },
                { equipped: 'wings' },
                { armor: 1 },
            ];
            const looks = loadouts.map((l) => draw(id, 7, l).calls.join('\n'));
            for (const look of looks) expect(look).not.toBe(base);
            expect(new Set(looks).size).toBe(loadouts.length);
        });

        it.each(CHARACTER_IDS)('%s grows with each level of Booster, Harvester and Armor', (id) => {
            for (const [equipped, key] of [
                ['booster', 'level'],
                ['expander', 'level'],
                [undefined, 'armor'],
            ] as const) {
                const looks = [1, 2, 3].map((n) =>
                    draw(id, 7, { equipped, [key]: n }).calls.join('\n')
                );
                expect(new Set(looks).size).toBe(3);
            }
        });

        it('draws more of a slot upgrade only while it is equipped', () => {
            // The level of an upgrade that isn't equipped is irrelevant: the caller passes only
            // the active one, so an empty slot with a stale level draws the bare character.
            expect(draw('farmer', 7, { equipped: '', level: 3 }).calls).toEqual(
                draw('farmer', 7).calls
            );
        });

        it('the Harvester has 1, 7 then 19 cells', () => {
            const cells = HARVESTER_CELLS.map(({ rings }) => 1 + 3 * rings * (rings + 1));
            expect(cells).toEqual([1, 7, 19]);
        });

        it('the Jetpack lifts the character off the ground, the shadow stays down', () => {
            const walking = bounds(draw('engineer', 4).points);
            const flying = bounds(draw('engineer', 4, { equipped: 'wings' }).points);
            // Its head is higher by the lift; the lowest point drawn is the same shadow.
            expect(walking.top - flying.top).toBeGreaterThanOrEqual(JETPACK_LIFT - 1);
            expect(flying.bottom).toBeCloseTo(walking.bottom, 5);
        });
    });
});

describe('nearestDirection', () => {
    it('maps every facing angle to its own index', () => {
        DIRECTIONS.forEach((d, i) => expect(nearestDirection(d.angle)).toBe(i));
    });

    it('wraps angles and rounds to the closest facing', () => {
        expect(nearestDirection(0.1)).toBe(2); // E
        expect(nearestDirection(Math.PI / 2 + 0.3)).toBe(4); // S
        expect(nearestDirection(Math.PI * 2 + Math.PI / 2)).toBe(4);
        expect(nearestDirection(-Math.PI - 0.1)).toBe(6); // W
        expect(nearestDirection(Math.PI + 0.1)).toBe(6);
    });
});

describe('loadoutOf', () => {
    const holder = (over: Partial<Parameters<typeof loadoutOf>[0]> = {}) => ({
        boosterLevel: 0,
        expanderLevel: 0,
        armorLevel: 0,
        wingsLevel: 0,
        equippedUpgrade: '',
        ...over,
    });

    it('shows nothing for a player with nothing', () => {
        expect(loadoutOf(holder())).toEqual({ equipped: '', level: 1, armor: 0 });
    });

    it('shows only the equipped slot upgrade, at its level', () => {
        const owned = { boosterLevel: 2, expanderLevel: 3, wingsLevel: 1 };
        expect(loadoutOf(holder({ ...owned, equippedUpgrade: 'booster' }))).toMatchObject({
            equipped: 'booster',
            level: 2,
        });
        expect(loadoutOf(holder({ ...owned, equippedUpgrade: 'expander' }))).toMatchObject({
            equipped: 'expander',
            level: 3,
        });
        expect(loadoutOf(holder({ ...owned, equippedUpgrade: 'wings' }))).toMatchObject({
            equipped: 'wings',
        });
        expect(loadoutOf(holder({ ...owned, equippedUpgrade: '' })).equipped).toBe('');
    });

    it('shows nothing for an equipped upgrade they do not own', () => {
        expect(loadoutOf(holder({ equippedUpgrade: 'booster' })).equipped).toBe('');
    });

    it('always shows Armor, equipped or not', () => {
        expect(loadoutOf(holder({ armorLevel: 2 })).armor).toBe(2);
        expect(
            loadoutOf(holder({ armorLevel: 3, boosterLevel: 1, equippedUpgrade: 'booster' }))
        ).toEqual({ equipped: 'booster', level: 1, armor: 3 });
    });
});

describe('characterIdOf', () => {
    it('passes a known character through and falls back to the default for anything else', () => {
        expect(characterIdOf('robot')).toBe('robot');
        expect(characterIdOf('')).toBe('farmer');
        expect(characterIdOf('wizard')).toBe('farmer');
    });
});

describe('layers', () => {
    const legs = (
        id: (typeof CHARACTER_IDS)[number],
        direction: number,
        frame = -1,
        loadout: CharacterLoadout = {}
    ) => {
        const r = recorder();
        drawLegs(
            r.brush,
            0,
            0,
            id,
            DIRECTIONS[direction].angle,
            loadout,
            frame < 0 ? STANDING : strideFrame(frame)
        );
        return r;
    };
    const body = (
        id: (typeof CHARACTER_IDS)[number],
        direction: number,
        loadout: CharacterLoadout = {}
    ) => {
        const r = recorder();
        drawBody(r.brush, 0, 0, id, DIRECTIONS[direction].angle, loadout);
        return r;
    };

    it.each(CHARACTER_IDS)('%s: the legs and the body are separate drawings', (id) => {
        const l = legs(id, 4);
        const b = body(id, 4);
        expect(l.calls.length).toBeGreaterThan(20);
        expect(b.calls.length).toBeGreaterThan(l.calls.length);
        // The shadow is the legs' (the first ellipses); the body has none.
        expect(l.calls.some((c) => c.startsWith('ellipse '))).toBe(true);
        expect(b.calls.filter((c) => c.startsWith('ellipse ')).length).toBeLessThan(
            l.calls.filter((c) => c.startsWith('ellipse ')).length + 10
        );
    });

    it.each(CHARACTER_IDS)('%s: the walk cycle moves the legs and not the body', (id) => {
        const frames = Array.from({ length: STRIDE_FRAMES }, (_, f) =>
            legs(id, 2, f).calls.join('\n')
        );
        expect(new Set(frames).size).toBe(STRIDE_FRAMES);
        expect(new Set([...frames, legs(id, 2).calls.join('\n')]).size).toBe(STRIDE_FRAMES + 1);
        // The body is a function of the aim alone: its frame has no stride in it.
        expect(body(id, 2).calls).toEqual(body(id, 2).calls);
    });

    it.each(CHARACTER_IDS)('%s: the legs can face away from the body', (id) => {
        const r = recorder();
        drawCharacter(r.brush, 0, 0, id, DIRECTIONS[2].angle, {}, true, {
            legAngle: DIRECTIONS[4].angle,
            stride: strideFrame(1),
        });
        const together = recorder();
        drawCharacter(together.brush, 0, 0, id, DIRECTIONS[2].angle, {}, true, {
            legAngle: DIRECTIONS[2].angle,
            stride: strideFrame(1),
        });
        expect(r.calls).not.toEqual(together.calls);
    });

    it.each(CHARACTER_IDS)('%s: every legs frame fits its frame', (id) => {
        const { width, height, originX, originY } = LEGS_FRAME;
        const loadouts: CharacterLoadout[] = [{}, { armor: 3 }, { equipped: 'wings', level: 1 }];
        for (const loadout of loadouts) {
            for (let d = 0; d < DIRECTIONS.length; d++) {
                for (let f = -1; f < STRIDE_FRAMES; f++) {
                    const box = bounds(legs(id, d, f, loadout).points);
                    expect(box.left).toBeGreaterThanOrEqual(-originX);
                    expect(box.right).toBeLessThanOrEqual(width - originX);
                    expect(box.top).toBeGreaterThanOrEqual(-originY);
                    expect(box.bottom).toBeLessThanOrEqual(height - originY);
                }
            }
        }
    });

    it('a Jetpack leaves the legs hanging: the stride does nothing', () => {
        const hover = { equipped: 'wings' as const, level: 1 };
        expect(legs('farmer', 2, 3, hover).calls).toEqual(legs('farmer', 2, -1, hover).calls);
    });

    it('Armor 3 puts shin guards on the legs of a humanoid', () => {
        expect(legs('farmer', 4, -1, { armor: 3 }).calls).not.toEqual(legs('farmer', 4).calls);
        expect(legs('farmer', 4, -1, { armor: 2 }).calls).toEqual(legs('farmer', 4).calls);
    });
});

describe('team colors', () => {
    const RED = 0xe74c3c;
    const BLUE = 0x3498db;

    it.each(CHARACTER_IDS)('%s: the suit takes the team color, on both layers', (id) => {
        const red = draw(id, 4, { team: RED });
        const blue = draw(id, 4, { team: BLUE });
        expect(red.calls).not.toEqual(blue.calls);
        expect(red.calls).not.toEqual(draw(id, 4).calls);
        // The shapes are the same; only the colors differ.
        expect(red.calls.filter((c) => c.startsWith('poly')).length).toBe(
            blue.calls.filter((c) => c.startsWith('poly')).length
        );
        expect(red.calls.some((c) => c.startsWith('fill ') && c.includes(' '))).toBe(true);
    });

    it.each(CHARACTER_IDS)('%s: a team color changes the legs and the body drawings', (id) => {
        const legsOf = (team?: number) => {
            const r = recorder();
            drawLegs(r.brush, 0, 0, id, 0, { team });
            return r.calls;
        };
        const bodyOf = (team?: number) => {
            const r = recorder();
            drawBody(r.brush, 0, 0, id, 0, { team });
            return r.calls;
        };
        expect(legsOf(RED)).not.toEqual(legsOf(BLUE));
        expect(bodyOf(RED)).not.toEqual(bodyOf(BLUE));
    });
});

describe('texture keys and baking', () => {
    const textures = () => {
        const made = new Set<string>();
        const generate = vi.fn((key: string) => made.add(key));
        const scene = {
            textures: { exists: (key: string) => made.has(key) },
            make: {
                graphics: () => ({
                    ...recorder().brush,
                    generateTexture: generate,
                    destroy: vi.fn(),
                }),
            },
        };
        return { scene: scene as never, generate };
    };

    it('keys a body frame by character, facing, slot upgrade, armor and team', () => {
        const keys = [
            bodyTextureKey('farmer', 0),
            bodyTextureKey('robot', 0),
            bodyTextureKey('farmer', 1),
            bodyTextureKey('farmer', 0, { equipped: 'booster', level: 1 }),
            bodyTextureKey('farmer', 0, { equipped: 'booster', level: 2 }),
            bodyTextureKey('farmer', 0, { armor: 1 }),
            bodyTextureKey('farmer', 0, { team: 0xff0000 }),
            bodyTextureKey('farmer', 0, { team: 0x00ff00 }),
        ];
        expect(new Set(keys).size).toBe(keys.length);
        expect(bodyTextureKey('farmer', 0, { equipped: '', level: 3 })).toBe(
            bodyTextureKey('farmer', 0)
        );
    });

    it('keys a legs frame only by what changes the legs', () => {
        const base = legsTextureKey('farmer', 2, 1, { team: 0xff0000 });
        // Upgrades that are not on the legs share their frames.
        expect(
            legsTextureKey('farmer', 2, 1, { team: 0xff0000, equipped: 'booster', level: 3 })
        ).toBe(base);
        expect(legsTextureKey('farmer', 2, 1, { team: 0xff0000, armor: 2 })).toBe(base);
        // The things that do change them don't.
        const others = [
            legsTextureKey('robot', 2, 1, { team: 0xff0000 }),
            legsTextureKey('farmer', 3, 1, { team: 0xff0000 }),
            legsTextureKey('farmer', 2, 2, { team: 0xff0000 }),
            legsTextureKey('farmer', 2, -1, { team: 0xff0000 }),
            legsTextureKey('farmer', 2, 1, { team: 0x00ff00 }),
            legsTextureKey('farmer', 2, 1, { team: 0xff0000, armor: 3 }),
            legsTextureKey('farmer', 2, 1, { team: 0xff0000, equipped: 'wings', level: 1 }),
        ];
        expect(new Set([base, ...others]).size).toBe(others.length + 1);
    });

    it('a Jetpack has one legs frame per facing, whatever the stride', () => {
        const hover = { equipped: 'wings' as const, level: 1 };
        expect(legsTextureKey('farmer', 2, 4, hover)).toBe(legsTextureKey('farmer', 2, -1, hover));
    });

    it('draws a body frame into a texture once per key', () => {
        const { scene, generate } = textures();
        const key = bakeBody(scene, 'scientist', 3, { armor: 1 });
        expect(generate).toHaveBeenCalledWith(key, CHARACTER_FRAME.width, CHARACTER_FRAME.height);
        expect(bakeBody(scene, 'scientist', 3, { armor: 1 })).toBe(key);
        expect(generate).toHaveBeenCalledTimes(1);
        bakeBody(scene, 'scientist', 4, { armor: 1 });
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('draws a legs frame into a smaller texture once per key', () => {
        const { scene, generate } = textures();
        const key = bakeLegs(scene, 'engineer', 5, 2, { team: 0x3498db });
        expect(generate).toHaveBeenCalledWith(key, LEGS_FRAME.width, LEGS_FRAME.height);
        expect(LEGS_FRAME.width * LEGS_FRAME.height).toBeLessThan(
            CHARACTER_FRAME.width * CHARACTER_FRAME.height
        );
        expect(bakeLegs(scene, 'engineer', 5, 2, { team: 0x3498db })).toBe(key);
        expect(generate).toHaveBeenCalledTimes(1);
        bakeLegs(scene, 'engineer', 5, 3, { team: 0x3498db });
        expect(generate).toHaveBeenCalledTimes(2);
    });
});
