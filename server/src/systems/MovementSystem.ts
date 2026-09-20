import type { GameState } from '../state/GameState';

const PLAYER_SPEED = 200; // pixels/sec

/**
 * Applies each connected player's last-received input direction to their
 * position. Bounds-checks against the map size. Does not touch tile
 * ownership or collisions — see CollisionSystem for that.
 */
function update(state: GameState, dt: number): void {
  const mapPixelWidth = state.mapWidth * 32; // TILE_SIZE placeholder, see CollisionSystem
  const mapPixelHeight = state.mapHeight * 32;

  state.players.forEach((player) => {
    if (!player.connected) return;

    // TODO: read player's last input direction (stored via onMessage handler
    // in GameRoom) and apply velocity * dt here. Placeholder no-op until
    // input storage is wired up.
    void PLAYER_SPEED;
    void dt;

    player.x = Math.max(0, Math.min(mapPixelWidth, player.x));
    player.y = Math.max(0, Math.min(mapPixelHeight, player.y));
  });
}

export const MovementSystem = { update };
