import type { GameState, Player } from '../state/GameState';
import { CollisionSystem } from './CollisionSystem';
import { StructureSystem } from './StructureSystem';
import { PROJECTILE_LIFETIME_MS, PROJECTILE_DAMAGE } from '../constants';
import { mapPixelSize } from '../hex';
import type { Broadcast } from './Broadcast';
import type { PlayerHitEvent } from '../types/shared';

function respawnPlayer(state: GameState, player: Player): void {
  // Territory-claiming game, not a deathmatch — a defeated player respawns
  // at the map center with full health rather than being eliminated.
  // Kills and tilesOwned are untouched.
  player.health = 100;
  const { width, height } = mapPixelSize(state.mapWidth, state.mapHeight);
  player.x = width / 2;
  player.y = height / 2;
  player.vx = 0;
  player.vy = 0;
}

/**
 * Advances all in-flight projectiles, applies hit detection against
 * players and structures, and removes expired or spent projectiles.
 */
function update(state: GameState, dt: number, broadcast: Broadcast): void {
  if (state.phase.phase !== 'combat') return;

  const now = Date.now();
  const { width, height } = mapPixelSize(state.mapWidth, state.mapHeight);
  const toRemove = new Set<string>();

  state.projectiles.forEach((proj, id) => {
    proj.x += Math.cos(proj.angle) * proj.speed * dt;
    proj.y += Math.sin(proj.angle) * proj.speed * dt;

    state.players.forEach((player) => {
      if (toRemove.has(id) || player.id === proj.ownerId || !player.connected) return;
      if (!CollisionSystem.checkProjectilePlayerCollision(proj, player)) return;

      toRemove.add(id);
      player.health = Math.max(0, player.health - PROJECTILE_DAMAGE);
      broadcast('playerHit', {
        targetId: player.id,
        damage: PROJECTILE_DAMAGE,
        shooterId: proj.ownerId,
      } satisfies PlayerHitEvent);

      if (player.health === 0) {
        const shooter = state.players.get(proj.ownerId);
        if (shooter) shooter.kills++;
        respawnPlayer(state, player);
      }
    });

    state.structures.forEach((structure) => {
      if (toRemove.has(id) || structure.ownerId === proj.ownerId) return;
      if (!CollisionSystem.checkProjectileStructureCollision(proj, structure)) return;

      toRemove.add(id);
      StructureSystem.applyDamage(state, structure.id, PROJECTILE_DAMAGE, broadcast);
    });

    const outOfBounds = proj.x < 0 || proj.y < 0 || proj.x > width || proj.y > height;
    const expired = now - proj.spawnedAt > PROJECTILE_LIFETIME_MS;
    if (outOfBounds || expired) toRemove.add(id);
  });

  toRemove.forEach((id) => state.projectiles.delete(id));
}

export const CombatSystem = { update };
