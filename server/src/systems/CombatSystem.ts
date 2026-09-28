import type { GameState, Player } from '../state/GameState';
import { CollisionSystem } from './CollisionSystem';
import { StructureSystem } from './StructureSystem';
import { PROJECTILE_LIFETIME_MS, SHOT_TERRAIN_STEP } from '../constants';
import { projectileVelocity } from '../../../shared/projectiles';
import { isMountainAtPoint, spawnPoint } from '../terrain';
import { mapPixelSize } from '../hex';
import { areAllies } from '../teams';
import type { Broadcast } from './Broadcast';
import type { PlayerHitEvent } from '../types/shared';

function respawnPlayer(state: GameState, player: Player): void {
    // Territory-claiming game, not a deathmatch — a defeated player respawns
    // at their own spot on the spawn line with full health rather than being
    // eliminated. Kills and tilesOwned are untouched.
    player.health = player.maxHealth;
    const start = spawnPoint(state, player.spawnSlot);
    player.x = start.x;
    player.y = start.y;
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
        // Speed is measured on-screen (see projectileVelocity, shared with the client's
        // extrapolation), so shots look equally fast in every direction.
        const prev = { x: proj.x, y: proj.y };
        const velocity = projectileVelocity(proj.angle, proj.speed);
        proj.x += velocity.x * dt;
        proj.y += velocity.y * dt;

        // Mountains stop shots (water doesn't). This tick's travel is checked every
        // SHOT_TERRAIN_STEP px, so a shot can't skip over the thin tip of a mountain hex.
        const travel = Math.hypot(proj.x - prev.x, proj.y - prev.y);
        const steps = Math.max(1, Math.ceil(travel / SHOT_TERRAIN_STEP));
        for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            const x = prev.x + (proj.x - prev.x) * t;
            const y = prev.y + (proj.y - prev.y) * t;
            if (isMountainAtPoint(state, x, y)) {
                toRemove.add(id);
                return;
            }
        }

        state.players.forEach((player) => {
            if (toRemove.has(id) || !player.connected) return;
            if (areAllies(state, proj.ownerId, player.id)) return;
            if (!CollisionSystem.checkProjectilePlayerCollision(proj, player, prev)) return;

            toRemove.add(id);
            player.health = Math.max(0, player.health - proj.damage);
            broadcast('playerHit', {
                targetId: player.id,
                damage: proj.damage,
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
            StructureSystem.applyDamage(state, structure.id, proj.damage, broadcast);
        });

        const outOfBounds = proj.x < 0 || proj.y < 0 || proj.x > width || proj.y > height;
        const expired = now - proj.spawnedAt > PROJECTILE_LIFETIME_MS;
        if (outOfBounds || expired) toRemove.add(id);
    });

    toRemove.forEach((id) => state.projectiles.delete(id));
}

export const CombatSystem = { update };
