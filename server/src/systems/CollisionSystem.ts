import type { GameState } from '../state/GameState';
import { PLAYER_RADIUS, PROJECTILE_RADIUS } from '../constants';
import { hexIndex, isValidHex, pixelToHex } from '../hex';
import type { Broadcast } from './Broadcast';
import type { TilesClaimedEvent } from '../types/shared';

/**
 * Circle-circle hit test against the path the projectile travelled this tick
 * (`prev` -> `proj`) rather than just its end point. Shots cover 20-33 world px
 * per tick, which is close to the 22 px hit radius, so testing only the end
 * point lets grazing shots skip over a player. Omit `prev` to test a point.
 */
function checkProjectilePlayerCollision(
    proj: { x: number; y: number },
    player: { x: number; y: number },
    prev: { x: number; y: number } = proj
): boolean {
    const segX = proj.x - prev.x;
    const segY = proj.y - prev.y;
    const segLengthSq = segX * segX + segY * segY;

    // Closest point on the segment to the player's center.
    let t = 0;
    if (segLengthSq > 0) {
        t = ((player.x - prev.x) * segX + (player.y - prev.y) * segY) / segLengthSq;
        t = Math.max(0, Math.min(1, t));
    }
    const dx = prev.x + segX * t - player.x;
    const dy = prev.y + segY * t - player.y;
    return Math.sqrt(dx * dx + dy * dy) < PROJECTILE_RADIUS + PLAYER_RADIUS;
}

// A structure fills its whole hex, so a projectile hits it exactly when the
// projectile is inside that hex.
function checkProjectileStructureCollision(
    proj: { x: number; y: number },
    structure: { tileX: number; tileY: number }
): boolean {
    const { col, row } = pixelToHex(proj.x, proj.y);
    return col === structure.tileX && row === structure.tileY;
}

function claimTile(
    state: GameState,
    player: { id: string; x: number; y: number; tilesOwned: number },
    claimed: TilesClaimedEvent['tiles']
): void {
    const { col: tileX, row: tileY } = pixelToHex(player.x, player.y);
    // Map corners/edges aren't fully covered by hexes, so a player can be
    // standing over no tile at all.
    if (!isValidHex(tileX, tileY, state.mapWidth, state.mapHeight)) return;
    const tile = state.tiles[hexIndex(tileX, tileY, state.mapWidth)];
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
    if (state.phase.phase !== 'playing') return;

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
