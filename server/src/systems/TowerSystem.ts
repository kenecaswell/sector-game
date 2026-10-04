import type { GameState, Structure } from '../state/GameState';
import { TOWER_FIRE_INTERVAL_MS, TOWER_RANGE } from '../constants';
import { hexCenter } from '../hex';
import { aimAngle, hasLineOfSight, screenDistance } from '../bots/aim';
import { areAllies } from '../teams';
import { GUN_DAMAGE, structureHexes } from '../types/shared';
import { CombatSystem } from './CombatSystem';
import { RespawnSystem } from './RespawnSystem';

/** Where a Guard Tower's shots start: the middle of its three hexes (world px). */
function muzzle(tower: Structure): { x: number; y: number } {
    const hexes = structureHexes(tower).map((h) => hexCenter(h.col, h.row));
    return {
        x: hexes.reduce((sum, c) => sum + c.x, 0) / hexes.length,
        y: hexes.reduce((sum, c) => sum + c.y, 0) / hexes.length,
    };
}

/**
 * Every Guard Tower that's ready fires the Blaster at the nearest enemy player within
 * TOWER_RANGE that it has a clear line to (mountains stop shots). Towers never run out of ammo and
 * ignore structures; a kill counts for the tower's owner, even one who has left the match room's
 * players (no owner in `state.players`, no shot). Defeated players aren't targets, nor is anyone
 * in the safe area of their own spawn (SPAWN_SAFE_RADIUS); a frozen (disconnected) one is, as with
 * any shooter. `now` is for tests.
 */
function update(state: GameState, now = Date.now()): void {
    if (state.phase.phase !== 'playing') return;

    state.structures.forEach((tower) => {
        if (tower.type !== 'guardTower' || now < tower.nextShotAt) return;
        const owner = state.players.get(tower.ownerId);
        if (!owner) return;

        const from = muzzle(tower);
        let target: { x: number; y: number; vx: number; vy: number } | null = null;
        let nearest = TOWER_RANGE;
        state.players.forEach((player) => {
            if (!RespawnSystem.isAlive(player) || areAllies(state, tower.ownerId, player.id))
                return;
            if (RespawnSystem.inSpawnSafeArea(player)) return; // nobody is shot as they respawn
            if (RespawnSystem.inGrace(player, now)) return; // nor just after it
            const distance = screenDistance(from, player);
            if (distance > nearest || !hasLineOfSight(state, from, player)) return;
            nearest = distance;
            target = player;
        });
        if (!target) return;

        tower.nextShotAt = now + TOWER_FIRE_INTERVAL_MS;
        const angle = aimAngle(from, target, 0);
        CombatSystem.spawnShot(
            state,
            tower.ownerId,
            from.x,
            from.y,
            angle,
            GUN_DAMAGE.basic,
            undefined,
            true
        );
    });
}

export const TowerSystem = { update, muzzle };
