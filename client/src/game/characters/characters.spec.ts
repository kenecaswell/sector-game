import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../../types/shared';
import { recorder } from '../../test/brush';
import {
    CHARACTER_FRAME,
    DIRECTIONS,
    JETPACK_LIFT,
    drawCharacter,
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
