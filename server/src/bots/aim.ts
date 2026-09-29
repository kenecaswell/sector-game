// How bots see and aim: line of sight past mountains, and where to shoot to hit a moving target.
//
// Shots fly at a constant speed *on screen* (world y scaled by SCREEN_Y_SCALE; see
// projectileVelocity), so aiming is worked out in screen space and turned back into a world angle.

import type { GameState } from '../state/GameState';
import { PROJECTILE_SPEED, SCREEN_Y_SCALE, SHOT_TERRAIN_STEP } from '../constants';
import { isMountainAtPoint } from '../terrain';

interface Point {
    x: number;
    y: number;
}

/** Distance between two world points as seen on screen, which is how shot range works. */
export function screenDistance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, (b.y - a.y) * SCREEN_Y_SCALE);
}

/** Whether a shot from `from` could reach `to` without hitting a mountain (water doesn't stop shots). */
export function hasLineOfSight(state: GameState, from: Point, to: Point): boolean {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.ceil(length / SHOT_TERRAIN_STEP);
    for (let k = 1; k < steps; k++) {
        const t = k / steps;
        if (isMountainAtPoint(state, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) {
            return false;
        }
    }
    return true;
}

/**
 * The world angle to fire at from `from` to hit `target`, which moves at (vx, vy) world px/s. `lead`
 * (0..1) is how much of that motion to allow for: 0 aims where it is now, 1 where a shot at `speed`
 * would meet it if it keeps going (falling back to where it is if a shot can't catch it).
 */
export function aimAngle(
    from: Point,
    target: Point & { vx: number; vy: number },
    lead: number,
    speed = PROJECTILE_SPEED
): number {
    // Screen space: the shot's speed is the same in every direction.
    const px = target.x - from.x;
    const py = (target.y - from.y) * SCREEN_Y_SCALE;
    const vx = target.vx * lead;
    const vy = target.vy * SCREEN_Y_SCALE * lead;
    // |p + v t| = speed t  =>  (v.v - speed^2) t^2 + 2 (p.v) t + p.p = 0; the smallest t > 0.
    const a = vx * vx + vy * vy - speed * speed;
    const b = 2 * (px * vx + py * vy);
    const c = px * px + py * py;
    let t = 0;
    if (Math.abs(a) < 1e-6) {
        if (b < 0) t = -c / b;
    } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
            const root = Math.sqrt(disc);
            const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((r) => r > 0);
            if (roots.length > 0) t = Math.min(...roots);
        }
    }
    const aimX = px + vx * t;
    const aimY = py + vy * t;
    return Math.atan2(aimY / SCREEN_Y_SCALE, aimX);
}

/** A random miss of up to `error` radians either side, more often small than large. */
export function aimWobble(error: number, random: () => number): number {
    return (random() + random() - 1) * error;
}
