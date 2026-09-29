import { describe, expect, it } from 'vitest';
import { PROJECTILE_SPEED, SCREEN_Y_SCALE } from '../constants';
import { hexCenter } from '../hex';
import { projectileVelocity } from '../../../shared/projectiles';
import { setTerrain, world } from '../test/world';
import { TERRAIN } from '../types/shared';
import { aimAngle, aimWobble, hasLineOfSight, screenDistance } from './aim';

/** How close a shot fired at `angle` from `from` gets to a target moving in a straight line. */
function closestApproach(
    from: { x: number; y: number },
    target: { x: number; y: number; vx: number; vy: number },
    angle: number
): number {
    const shot = projectileVelocity(angle, PROJECTILE_SPEED);
    let best = Infinity;
    for (let t = 0; t <= 2; t += 0.001) {
        const dx = from.x + shot.x * t - (target.x + target.vx * t);
        const dy = from.y + shot.y * t - (target.y + target.vy * t);
        best = Math.min(best, Math.hypot(dx, dy));
    }
    return best;
}

describe('aimAngle', () => {
    it('aims straight at a target that is standing still', () => {
        const angle = aimAngle({ x: 0, y: 0 }, { x: 100, y: 100, vx: 0, vy: 0 }, 1);
        expect(angle).toBeCloseTo(Math.PI / 4);
    });

    it('with full lead, a shot meets a moving target, in any direction on screen', () => {
        const from = { x: 500, y: 500 };
        for (const [x, y, vx, vy] of [
            [900, 500, 0, 180],
            [500, 100, 150, 0],
            [200, 800, -120, -200],
        ]) {
            const target = { x, y, vx, vy };
            expect(closestApproach(from, target, aimAngle(from, target, 1))).toBeLessThan(2);
            // Aiming where it is now misses by a lot.
            expect(closestApproach(from, target, aimAngle(from, target, 0))).toBeGreaterThan(30);
        }
    });

    it('wobble stays within the error either side', () => {
        let random = 0;
        const values = () => (random = (random + 0.37) % 1);
        for (let i = 0; i < 100; i++)
            expect(Math.abs(aimWobble(0.2, values))).toBeLessThanOrEqual(0.2);
    });
});

describe('screenDistance and hasLineOfSight', () => {
    it('measures distance on screen (y squashed), like shot range', () => {
        expect(screenDistance({ x: 0, y: 0 }, { x: 0, y: 100 })).toBeCloseTo(100 * SCREEN_Y_SCALE);
    });

    it('mountains block the view, water does not', () => {
        const state = world();
        const a = hexCenter(10, 20);
        const b = hexCenter(20, 20);
        expect(hasLineOfSight(state, a, b)).toBe(true);
        setTerrain(state, TERRAIN.water, [
            [15, 20],
            [15, 21],
            [15, 19],
        ]);
        expect(hasLineOfSight(state, a, b)).toBe(true);
        setTerrain(state, TERRAIN.mountain, [
            [15, 20],
            [15, 21],
            [15, 19],
        ]);
        expect(hasLineOfSight(state, a, b)).toBe(false);
    });
});
