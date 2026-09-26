import { SCREEN_Y_SCALE } from './constants';

/**
 * World-space velocity (px/s) of a projectile heading `angle` at `speed`. Speed is measured
 * on-screen (see SCREEN_Y_SCALE), like player movement: a shot heading up or down the screen
 * covers more world y per second than one heading sideways covers world x, so both look equally
 * fast. The server moves projectiles with it; the client uses it to extrapolate between ticks.
 */
export function projectileVelocity(angle: number, speed: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const onScreenLength = Math.hypot(cos, sin * SCREEN_Y_SCALE);
    return { x: (cos / onScreenLength) * speed, y: (sin / onScreenLength) * speed };
}
