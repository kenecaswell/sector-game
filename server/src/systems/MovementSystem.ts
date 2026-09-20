import type { GameState } from '../state/GameState';
import { PLAYER_SPEED, TILE_SIZE } from '../constants';

export interface PlayerInput {
  dir: { x: number; y: number };
  seq: number;
}

/**
 * Applies each connected player's last-received input direction to their
 * position, normalizing diagonal input so it isn't faster than cardinal
 * movement. Bounds-checks against the map size. Does not touch tile
 * ownership or collisions — see CollisionSystem for that.
 */
function update(state: GameState, inputs: Map<string, PlayerInput>, dt: number): void {
  const mapPixelWidth = state.mapWidth * TILE_SIZE;
  const mapPixelHeight = state.mapHeight * TILE_SIZE;

  state.players.forEach((player, sessionId) => {
    if (!player.connected) return;

    const input = inputs.get(sessionId);
    if (!input) return;

    const { x: dx, y: dy } = input.dir;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude === 0) return;

    // Normalize so diagonal movement isn't faster than cardinal movement.
    const nx = dx / magnitude;
    const ny = dy / magnitude;

    player.x = Math.max(0, Math.min(mapPixelWidth, player.x + nx * PLAYER_SPEED * dt));
    player.y = Math.max(0, Math.min(mapPixelHeight, player.y + ny * PLAYER_SPEED * dt));
  });
}

export const MovementSystem = { update };
