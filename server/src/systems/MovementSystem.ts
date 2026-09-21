import type { GameState } from '../state/GameState';
import {
    INPUT_STALE_MS,
    MAP_EDGE_MARGIN,
    PLAYER_ACCEL,
    PLAYER_RADIUS,
    PLAYER_SPEED,
    SCREEN_Y_SCALE,
} from '../constants';
import { hexEdgeContact, mapPixelSize } from '../hex';

export interface PlayerInput {
    dir: { x: number; y: number };
    seq: number;
    receivedAt: number; // server ms timestamp; see INPUT_STALE_MS
}

const INPUT_DEADZONE = 0.05;
const APPROACH_EPSILON = 1e-3; // px; see findBlockingStructure

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
 * Structures are solid to everyone except their owner: a player can't move
 * into another player's structure and instead slides along it. Players who end
 * up inside one (e.g. it was built on top of them) can still move out.
 *
 * Players with no input keep decelerating to a stop. Does not touch tile
 * ownership — see CollisionSystem for that.
 */
function update(state: GameState, inputs: Map<string, PlayerInput>, dt: number): void {
    // Players only move during the match: not in the lobby, while shopping, or after it ends.
    if (state.phase.phase !== 'playing') {
        state.players.forEach((player) => {
            player.vx = 0;
            player.vy = 0;
        });
        return;
    }

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
        let x = Math.max(MAP_EDGE_MARGIN, Math.min(width - MAP_EDGE_MARGIN, nextX));
        let y = Math.max(MAP_EDGE_MARGIN, Math.min(height - MAP_EDGE_MARGIN, nextY));

        // Sliding along a map edge shouldn't keep building velocity into it.
        if (x !== nextX) player.vx = 0;
        if (y !== nextY) player.vy = 0;

        const hit = findBlockingStructure(state, sessionId, player.x, player.y, x, y);
        if (hit) {
            // Slide: drop the part of the motion (and velocity) that points into the structure.
            const moveX = x - player.x;
            const moveY = y - player.y;
            const into = moveX * hit.nx + moveY * hit.ny;
            if (into < 0) {
                x = player.x + moveX - into * hit.nx;
                y = player.y + moveY - into * hit.ny;
            }
            const speedInto = player.vx * hit.nx + player.vy * hit.ny;
            if (speedInto < 0) {
                player.vx -= speedInto * hit.nx;
                player.vy -= speedInto * hit.ny;
            }
            // Wedged between two structures: don't move at all.
            if (findBlockingStructure(state, sessionId, player.x, player.y, x, y)) {
                x = player.x;
                y = player.y;
            }
        }

        player.x = Math.max(MAP_EDGE_MARGIN, Math.min(width - MAP_EDGE_MARGIN, x));
        player.y = Math.max(MAP_EDGE_MARGIN, Math.min(height - MAP_EDGE_MARGIN, y));
    });
}

/**
 * The first structure (not owned by `playerId`) that moving from (fromX, fromY)
 * to (toX, toY) would push the player's circle further into, or null. Moves that
 * don't get closer are allowed, which is what lets a player who's already inside
 * a structure walk out of it. Returns the push-out direction at the player's
 * *current* position (edge normal, or away from the nearest corner) so the caller
 * can slide around it — using the destination's normal fails at corners, where it
 * points along the motion.
 */
function findBlockingStructure(
    state: GameState,
    playerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): { nx: number; ny: number } | null {
    for (const structure of state.structures.values()) {
        if (structure.ownerId === playerId) continue;

        const to = hexEdgeContact(toX, toY, structure.tileX, structure.tileY);
        if (to.distance >= PLAYER_RADIUS) continue;

        const from = hexEdgeContact(fromX, fromY, structure.tileX, structure.tileY);
        // Tolerance: sliding along an edge keeps the distance the same up to floating-point
        // noise, and that must not count as "getting closer" or the player freezes in place.
        if (to.distance < from.distance - APPROACH_EPSILON) return { nx: from.nx, ny: from.ny };
    }
    return null;
}

export const MovementSystem = { update };
