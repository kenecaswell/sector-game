import type { GameState } from '../state/GameState';
import { INPUT_STALE_MS, PLAYER_ACCEL, PLAYER_SPEED, SCREEN_Y_SCALE } from '../constants';
import { mapPixelSize } from '../hex';

export interface PlayerInput {
    dir: { x: number; y: number };
    seq: number;
    receivedAt: number; // server ms timestamp; see INPUT_STALE_MS
}

const INPUT_DEADZONE = 0.05;

/**
 * Moves each connected player by easing their velocity toward the velocity
 * their input asks for, at a fixed acceleration (PLAYER_ACCEL). Direction is
 * a free-form vector, so movement can be at any angle; its magnitude (0..1)
 * scales speed, which lets an analog joystick walk slowly. Because the same
 * acceleration limit applies when speeding up, stopping, and changing
 * direction, motion is smooth rather than snapping between headings.
 *
 * Speed and acceleration are measured on-screen (see SCREEN_Y_SCALE): the input
 * vector's length is taken with y scaled down, so a full-strength vector pointing
 * up the screen has a larger world-y component than one pointing sideways has
 * world-x, and both look equally fast. Longer vectors are clamped to that limit.
 *
 * Players with no input keep decelerating to a stop. Does not touch tile
 * ownership or collisions — see CollisionSystem for that.
 */
function update(state: GameState, inputs: Map<string, PlayerInput>, dt: number): void {
    const { width, height } = mapPixelSize(state.mapWidth, state.mapHeight);
    const maxVelocityChange = PLAYER_ACCEL * dt;
    const now = Date.now();

    state.players.forEach((player, sessionId) => {
        if (!player.connected) {
            player.vx = 0;
            player.vy = 0;
            return;
        }

        const input = inputs.get(sessionId);
        const fresh = input !== undefined && now - input.receivedAt <= INPUT_STALE_MS;
        let dx = fresh ? input.dir.x : 0;
        let dy = fresh ? input.dir.y : 0;
        const magnitude = Math.hypot(dx, dy * SCREEN_Y_SCALE);
        if (magnitude < INPUT_DEADZONE) {
            dx = 0;
            dy = 0;
        } else if (magnitude > 1) {
            // Diagonals (and oversized vectors) must not be faster than top speed on screen.
            dx /= magnitude;
            dy /= magnitude;
        }

        const targetVx = dx * PLAYER_SPEED;
        const targetVy = dy * PLAYER_SPEED;
        const deltaVx = targetVx - player.vx;
        const deltaVy = targetVy - player.vy;
        const deltaLength = Math.hypot(deltaVx, deltaVy * SCREEN_Y_SCALE);

        if (deltaLength <= maxVelocityChange) {
            player.vx = targetVx;
            player.vy = targetVy;
        } else {
            const scale = maxVelocityChange / deltaLength;
            player.vx += deltaVx * scale;
            player.vy += deltaVy * scale;
        }

        const nextX = player.x + player.vx * dt;
        const nextY = player.y + player.vy * dt;
        player.x = Math.max(0, Math.min(width, nextX));
        player.y = Math.max(0, Math.min(height, nextY));

        // Sliding along a map edge shouldn't keep building velocity into it.
        if (player.x !== nextX) player.vx = 0;
        if (player.y !== nextY) player.vy = 0;
    });
}

export const MovementSystem = { update };
