import type { GameState } from '../state/GameState';

export const TILE_SIZE = 32;
const PROJECTILE_RADIUS = 6;
const PLAYER_RADIUS = 16;

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
  player: { id: string; x: number; y: number; tilesOwned: number }
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
}

/**
 * Runs tile-claiming collision each tick. Projectile/structure hit
 * detection is wired in once CombatSystem spawns projectiles.
 */
function update(state: GameState): void {
  if (state.phase.phase !== 'claiming' && state.phase.phase !== 'combat') return;

  state.players.forEach((player) => {
    if (!player.connected) return;
    claimTile(state, player);
  });
}

export const CollisionSystem = {
  update,
  checkProjectilePlayerCollision,
  checkProjectileStructureCollision,
  claimTile,
};
