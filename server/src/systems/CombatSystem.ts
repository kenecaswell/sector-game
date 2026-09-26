import type { GameState, Player } from '../state/GameState';
import { CollisionSystem } from './CollisionSystem';
import { StructureSystem } from './StructureSystem';
import { PROJECTILE_LIFETIME_MS, PROJECTILE_DAMAGE, SCREEN_Y_SCALE } from '../constants';
import { mapPixelSize } from '../hex';
import { areAllies } from '../teams';
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
 * Shots pass through the shooter's teammates and their structures (no
 * friendly fire).
 */
function update(state: GameState, dt: number, broadcast: Broadcast): void {
    if (state.phase.phase !== 'playing') return;

    const now = Date.now();
    const { width, height } = mapPixelSize(state.mapWidth, state.mapHeight);
    const toRemove = new Set<string>();

    state.projectiles.forEach((proj, id) => {
        // Speed is measured on-screen (see SCREEN_Y_SCALE), like player movement: a shot
        // fired up the screen covers more world y per second than one fired sideways
        // covers world x, so both look equally fast.
        const prev = { x: proj.x, y: proj.y };
        const cos = Math.cos(proj.angle);
        const sin = Math.sin(proj.angle);
        const onScreenLength = Math.hypot(cos, sin * SCREEN_Y_SCALE);
        proj.x += (cos / onScreenLength) * proj.speed * dt;
        proj.y += (sin / onScreenLength) * proj.speed * dt;

        state.players.forEach((player) => {
            if (toRemove.has(id) || !player.connected) return;
            if (areAllies(state, proj.ownerId, player.id)) return;
            if (!CollisionSystem.checkProjectilePlayerCollision(proj, player, prev)) return;

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
            if (toRemove.has(id) || areAllies(state, proj.ownerId, structure.ownerId)) return;
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
