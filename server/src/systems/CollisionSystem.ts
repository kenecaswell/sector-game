import type { GameState } from '../state/GameState';
import { TILE_SIZE, PLAYER_RADIUS, PROJECTILE_RADIUS } from '../constants';
import type { Broadcast } from './Broadcast';
import type { TilesClaimedEvent } from '../types/shared';

function checkProjectilePlayerCollision(
  proj: { x: number; y: number },
  player: { x: number; y: number }
): boolean {
  const dx = proj.x - player.x;
  const dy = proj.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < PROJECTILE_RADIUS + PLAYER_RADIUS;
}

function checkProjectileStructureCollision(
  proj: { x: number; y: number },
  structure: { tileX: number; tileY: number }
): boolean {
  const sx = structure.tileX * TILE_SIZE;
  const sy = structure.tileY * TILE_SIZE;
  return proj.x > sx && proj.x < sx + TILE_SIZE && proj.y > sy && proj.y < sy + TILE_SIZE;
}

function claimTile(
  state: GameState,
  player: { id: string; x: number; y: number; tilesOwned: number },
  claimed: TilesClaimedEvent['tiles']
): void {
  const tileX = Math.floor(player.x / TILE_SIZE);
  const tileY = Math.floor(player.y / TILE_SIZE);
  const idx = tileY * state.mapWidth + tileX;
  const tile = state.tiles[idx];
  if (!tile || tile.ownerId === player.id) return;

  if (tile.ownerId !== '') {
    const prevOwner = state.players.get(tile.ownerId);
    if (prevOwner) prevOwner.tilesOwned--;
  }
  tile.ownerId = player.id;
  player.tilesOwned++;
  claimed.push({ x: tileX, y: tileY, ownerId: player.id });
}

/**
 * Runs tile-claiming collision each tick and broadcasts a single batched
 * 'tilesClaimed' event for whatever changed this tick (rather than one
 * broadcast per tile). Projectile/structure hit detection lives in
 * CombatSystem, which already iterates projectiles each tick.
 */
function update(state: GameState, broadcast: Broadcast): void {
  if (state.phase.phase !== 'claiming' && state.phase.phase !== 'combat') return;

  const claimed: TilesClaimedEvent['tiles'] = [];
  state.players.forEach((player) => {
    if (!player.connected) return;
    claimTile(state, player, claimed);
  });

  if (claimed.length > 0) {
    broadcast('tilesClaimed', { tiles: claimed } satisfies TilesClaimedEvent);
  }
}

export const CollisionSystem = {
  update,
  checkProjectilePlayerCollision,
  checkProjectileStructureCollision,
  claimTile,
};
