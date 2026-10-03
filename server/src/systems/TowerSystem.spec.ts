import { describe, expect, it } from 'vitest';
import { SPAWN_SAFE_RADIUS, TOWER_FIRE_INTERVAL_MS, TOWER_RANGE } from '../constants';
import { hexCenter, pixelToHex } from '../hex';
import { DT, addPlayer, addShot, addStructure, setTerrain, world } from '../test/world';
import { GUN_DAMAGE, TERRAIN } from '../types/shared';
import { CombatSystem } from './CombatSystem';
import { TowerSystem } from './TowerSystem';

const NOW = 5_000_000;

/** A world with player 'a' owning a Guard Tower anchored on (20, 20). */
function towerWorld() {
    const state = world();
    addPlayer(state, 'a', 100, 100);
    const tower = addStructure(state, 'a', 20, 20, 'guardTower', 0);
    const from = TowerSystem.muzzle(tower);
    return { state, tower, from };
}

/** An enemy standing `distance` screen px east of the tower's muzzle. */
function enemyAt(
    state: ReturnType<typeof world>,
    from: { x: number; y: number },
    distance: number
) {
    return addPlayer(state, 'foe', from.x + distance, from.y);
}

describe('TowerSystem', () => {
    it('shoots the Blaster at an enemy in range, with no ammo and no gun needed', () => {
        const { state, from } = towerWorld();
        const foe = enemyAt(state, from, TOWER_RANGE - 50);
        expect(state.players.get('a')?.gun).toBe('');
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(1);
        const shot = Array.from(state.projectiles.values())[0];
        expect(shot.ownerId).toBe('a');
        expect(shot.damage).toBe(GUN_DAMAGE.basic);
        expect(shot.x).toBeCloseTo(from.x);
        expect(shot.angle).toBeCloseTo(0); // straight east, at the enemy
        expect(foe.health).toBe(foe.maxHealth);
    });

    it('credits a kill to the tower owner', () => {
        const { state, from } = towerWorld();
        const foe = enemyAt(state, from, 100);
        foe.health = GUN_DAMAGE.basic;
        TowerSystem.update(state, NOW);
        for (let tick = 0; tick < 6; tick++) CombatSystem.update(state, DT, () => {});
        expect(state.players.get('a')?.kills).toBe(1);
        expect(foe.respawnAt).toBeGreaterThan(0);
    });

    it('ignores enemies out of range', () => {
        const { state, from } = towerWorld();
        enemyAt(state, from, TOWER_RANGE + 50);
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
    });

    it('ignores its owner, teammates, defeated players and other structures', () => {
        const { state, from } = towerWorld();
        state.players.get('a')!.x = from.x + 50;
        state.players.get('a')!.y = from.y;
        const mate = enemyAt(state, from, 80);
        mate.teamId = 'red';
        state.players.get('a')!.teamId = 'red';
        const down = addPlayer(state, 'down', from.x, from.y + 20);
        down.respawnAt = NOW + 5000;
        addStructure(state, 'foe2', 30, 30, 'farm');
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
    });

    it('picks the nearest enemy', () => {
        const { state, from } = towerWorld();
        enemyAt(state, from, 300);
        addPlayer(state, 'near', from.x, from.y - 100);
        TowerSystem.update(state, NOW);
        const shot = Array.from(state.projectiles.values())[0];
        expect(shot.angle).toBeLessThan(0); // up the screen, toward 'near'
    });

    it('fires at most once per interval, per tower', () => {
        const { state, from } = towerWorld();
        enemyAt(state, from, 200);
        TowerSystem.update(state, NOW);
        TowerSystem.update(state, NOW + TOWER_FIRE_INTERVAL_MS - 1);
        expect(state.projectiles.size).toBe(1);
        TowerSystem.update(state, NOW + TOWER_FIRE_INTERVAL_MS);
        expect(state.projectiles.size).toBe(2);
    });

    it("won't shoot through a mountain", () => {
        const { state, from } = towerWorld();
        const wall: Array<[number, number]> = [];
        for (let row = 10; row <= 30; row++) for (const col of [24, 25]) wall.push([col, row]);
        setTerrain(state, TERRAIN.mountain, wall);
        const behind = hexCenter(28, 20);
        addPlayer(state, 'foe', behind.x, behind.y);
        expect(behind.x - from.x).toBeLessThan(TOWER_RANGE + 200); // close enough but for the wall
        const foe = state.players.get('foe')!;
        foe.x = from.x + TOWER_RANGE - 20;
        foe.y = from.y;
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
        // Control: the same target with the wall gone is shot at.
        setTerrain(state, TERRAIN.ground, wall);
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(1);
    });

    it('does nothing outside the match, and for towers whose owner is gone', () => {
        const { state, from } = towerWorld();
        enemyAt(state, from, 100);
        state.phase.phase = 'results';
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
        state.phase.phase = 'playing';
        state.players.delete('a');
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
    });

    it('other structures never shoot', () => {
        const state = world();
        addPlayer(state, 'a', 100, 100);
        addStructure(state, 'a', 20, 20, 'farm');
        addStructure(state, 'a', 30, 30, 'power');
        const c = hexCenter(20, 20);
        addPlayer(state, 'foe', c.x + 100, c.y);
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
    });
});

describe('TowerSystem — the spawn safe area', () => {
    it("doesn't shoot a player standing in the safe area of their own spawn", () => {
        const { state, from } = towerWorld();
        const foe = enemyAt(state, from, 200);
        const spot = pixelToHex(foe.x, foe.y);
        foe.spawnTileX = spot.col + SPAWN_SAFE_RADIUS;
        foe.spawnTileY = spot.row;
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(0);
        // One hex further from their spawn than the safe area reaches: fair game.
        foe.spawnTileX = spot.col + SPAWN_SAFE_RADIUS + 1;
        TowerSystem.update(state, NOW);
        expect(state.projectiles.size).toBe(1);
    });

    it('still shoots others, and lets a different player outside the area be the target', () => {
        const { state, from } = towerWorld();
        const safe = enemyAt(state, from, 100);
        const spot = pixelToHex(safe.x, safe.y);
        safe.spawnTileX = spot.col;
        safe.spawnTileY = spot.row;
        const other = addPlayer(state, 'other', from.x, from.y - 250);
        other.spawnTileX = 2;
        other.spawnTileY = 2;
        TowerSystem.update(state, NOW);
        const shot = Array.from(state.projectiles.values())[0];
        expect(shot.angle).toBeLessThan(0); // up the screen, toward 'other'
    });

    it("a tower's shot flies through a player in the safe area, but a player's shot does not", () => {
        const { state } = towerWorld();
        const victim = addPlayer(state, 'v', 1500, 1500);
        const spot = pixelToHex(victim.x, victim.y);
        victim.spawnTileX = spot.col;
        victim.spawnTileY = spot.row;
        const towerShot = addShot(state, 'a', victim.x - 1, victim.y, 0, GUN_DAMAGE.basic);
        towerShot.fromTower = true;
        CombatSystem.update(state, DT, () => {});
        expect(victim.health).toBe(victim.maxHealth);
        expect(state.projectiles.has(towerShot.id)).toBe(true); // it went on
        addShot(state, 'a', victim.x - 1, victim.y, 0, GUN_DAMAGE.basic);
        CombatSystem.update(state, DT, () => {});
        expect(victim.health).toBe(victim.maxHealth - GUN_DAMAGE.basic);
    });
});
