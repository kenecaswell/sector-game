import { Projectile, type GameState, type Player } from '../state/GameState';
import { CollisionSystem } from './CollisionSystem';
import { StructureSystem } from './StructureSystem';
import { RespawnSystem } from './RespawnSystem';
import { PROJECTILE_LIFETIME_MS, SHOT_TERRAIN_STEP } from '../constants';
import { projectileVelocity } from '../../../shared/projectiles';
import { isMountainAtPoint } from '../terrain';
import { mapPixelSize } from '../hex';
import { areAllies } from '../teams';
import type { Broadcast } from './Broadcast';
import { GUN_DAMAGE, GUN_SHOT_LIFETIME_MS, isGunId, type PlayerHitEvent } from '../types/shared';

/**
 * `player` fires a shot heading `angle` (world radians), if it's the match and they have a gun and
 * ammo: one ammo is used and a projectile with their gun's damage starts from their position.
 * Returns whether it fired. People's shots come from GameRoom's `shoot` message, bots' from
 * BotSystem. (There's no server-side fire-rate limit yet; the client spaces out people's shots and
 * each bot's difficulty spaces out its own.)
 */
function fire(state: GameState, player: Player, angle: number): boolean {
    if (state.phase.phase !== 'playing' || !player.connected) return false;
    if (!RespawnSystem.isAlive(player)) return false;
    if (player.gun === '' || player.ammo <= 0 || !Number.isFinite(angle)) return false;

    player.ammo--;
    const gun = isGunId(player.gun) ? player.gun : 'basic';
    spawnShot(
        state,
        player.id,
        player.x,
        player.y,
        angle,
        GUN_DAMAGE[gun],
        GUN_SHOT_LIFETIME_MS[gun]
    );
    return true;
}

/**
 * Starts a projectile for `ownerId` (who gets the credit if it kills, and whose teammates it
 * passes through) at world point (x, y) heading `angle`. Players' guns and Guard Towers both
 * shoot through here; the caller has already checked the shooter is allowed to and paid for it.
 */
function spawnShot(
    state: GameState,
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    damage: number,
    lifetimeMs = PROJECTILE_LIFETIME_MS,
    fromTower = false
): void {
    const projectile = new Projectile();
    projectile.id = `${ownerId}-${state.shotsFired++}`;
    projectile.ownerId = ownerId;
    projectile.x = x;
    projectile.y = y;
    projectile.angle = angle;
    projectile.spawnedAt = Date.now();
    projectile.damage = damage;
    projectile.lifetimeMs = lifetimeMs;
    projectile.fromTower = fromTower;
    state.projectiles.set(projectile.id, projectile);
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
            // Defeated players are out of play until they respawn: shots pass where they fell.
            if (toRemove.has(id) || !player.connected || !RespawnSystem.isAlive(player)) return;
            if (areAllies(state, proj.ownerId, player.id)) return;
            // Just respawned: shots fly through them for a few seconds.
            if (RespawnSystem.inGrace(player, now)) return;
            // A tower's shot passes through players in their spawn's safe area.
            if (proj.fromTower && RespawnSystem.inSpawnSafeArea(player)) return;
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
                // Territory, not deathmatch: they drop their gear and respawn after a delay,
                // keeping their tiles, structures, materials and kills (RespawnSystem).
                RespawnSystem.defeat(state, player);
            }
        });

        state.structures.forEach((structure) => {
            if (toRemove.has(id) || areAllies(state, proj.ownerId, structure.ownerId)) return;
            if (!CollisionSystem.checkProjectileStructureCollision(proj, structure)) return;

            toRemove.add(id);
            StructureSystem.applyDamage(state, structure.id, proj.damage, broadcast);
        });

        const outOfBounds = proj.x < 0 || proj.y < 0 || proj.x > width || proj.y > height;
        const expired = now - proj.spawnedAt > proj.lifetimeMs;
        if (outOfBounds || expired) toRemove.add(id);
    });

    toRemove.forEach((id) => state.projectiles.delete(id));
}

export const CombatSystem = { update, fire, spawnShot };
