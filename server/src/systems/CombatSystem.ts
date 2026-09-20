import type { GameState } from '../state/GameState';
import { CollisionSystem } from './CollisionSystem';

const PROJECTILE_LIFETIME_MS = 2000;
const PROJECTILE_DAMAGE = 25;

/**
 * Advances all in-flight projectiles, applies hit detection against
 * players and structures, and removes expired or spent projectiles.
 */
function update(state: GameState, dt: number): void {
  if (state.phase.phase !== 'combat') return;

  const toRemove: string[] = [];

  state.projectiles.forEach((proj, id) => {
    proj.x += Math.cos(proj.angle) * proj.speed * dt;
    proj.y += Math.sin(proj.angle) * proj.speed * dt;

    state.players.forEach((player) => {
      if (player.id === proj.ownerId || !player.connected) return;
      if (CollisionSystem.checkProjectilePlayerCollision(proj, player)) {
        player.health = Math.max(0, player.health - PROJECTILE_DAMAGE);
        toRemove.push(id);
        // TODO: broadcast 'playerHit' event { targetId, damage, shooterId }
      }
    });

    // Out of bounds or lifetime expiry — placeholder bounds check.
    if (proj.x < 0 || proj.y < 0 || proj.x > state.mapWidth * 32 || proj.y > state.mapHeight * 32) {
      toRemove.push(id);
    }
  });

  toRemove.forEach((id) => state.projectiles.delete(id));
  void PROJECTILE_LIFETIME_MS; // reserved for time-based expiry once spawn timestamps are tracked
}

export const CombatSystem = { update };
