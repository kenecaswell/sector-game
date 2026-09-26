import type { GameState } from '../state/GameState';
import { HEX_SIZE, PLAYER_RADIUS, PROJECTILE_RADIUS } from '../constants';
import { hexCenter, hexIndex, isValidHex, pixelToHex } from '../hex';
import type { Broadcast } from './Broadcast';
import type { TilesClaimedEvent } from '../types/shared';
import { areAllies } from '../teams';

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

/**
 * Claims tiles for `player`: the hex they're standing on, plus every hex whose center is within
 * their `claimRadius` (the Expander upgrade doubles it). A hex holding an enemy's structure can't
 * be claimed — the structure protects its tile — and a teammate's hex is left alone.
 */
function claimTiles(
    state: GameState,
    player: { id: string; x: number; y: number; tilesOwned: number; claimRadius: number },
    claimed: TilesClaimedEvent['tiles']
): void {
    const { col: centerCol, row: centerRow } = pixelToHex(player.x, player.y);
    // Search a window a bit wider than the radius (hexes are at least ~48px apart).
    const reach = Math.ceil(player.claimRadius / HEX_SIZE) + 1;

    for (let row = centerRow - reach; row <= centerRow + reach; row++) {
        for (let col = centerCol - reach; col <= centerCol + reach; col++) {
            // Map corners/edges aren't fully covered by hexes, so this also skips positions
            // where the player is standing over no tile at all.
            if (!isValidHex(col, row, state.mapWidth, state.mapHeight)) continue;

            const isStandingOn = col === centerCol && row === centerRow;
            if (!isStandingOn) {
                const center = hexCenter(col, row);
                if (Math.hypot(center.x - player.x, center.y - player.y) > player.claimRadius) {
                    continue;
                }
            }

            const tile = state.tiles[hexIndex(col, row, state.mapWidth)];
            if (!tile || tile.ownerId === player.id) continue;
            if (tile.ownerId !== '' && areAllies(state, tile.ownerId, player.id)) continue;
            if (isProtectedFrom(state, col, row, player.id)) continue;

            if (tile.ownerId !== '') {
                const prevOwner = state.players.get(tile.ownerId);
                if (prevOwner) prevOwner.tilesOwned--;
            }
            tile.ownerId = player.id;
            player.tilesOwned++;
            claimed.push({ x: col, y: row, ownerId: player.id });
        }
    }
}

/** True if a structure owned by an enemy of `playerId` stands on this hex. */
function isProtectedFrom(state: GameState, col: number, row: number, playerId: string): boolean {
    for (const structure of state.structures.values()) {
        if (structure.tileX === col && structure.tileY === row)
            return !areAllies(state, structure.ownerId, playerId);
    }
    return false;
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
        claimTiles(state, player, claimed);
    });

    if (claimed.length > 0) {
        broadcast('tilesClaimed', { tiles: claimed } satisfies TilesClaimedEvent);
    }
}

export const CollisionSystem = {
    update,
    checkProjectilePlayerCollision,
    checkProjectileStructureCollision,
    claimTiles,
};
