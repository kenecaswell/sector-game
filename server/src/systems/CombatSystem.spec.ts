import { describe, expect, it } from 'vitest';
import {
    PLAYER_RADIUS,
    PROJECTILE_LIFETIME_MS,
    PROJECTILE_RADIUS,
    RESPAWN_DELAY_MS,
    SCREEN_Y_SCALE as SQ,
    TICK_RATE,
} from '../constants';
import { hexCenter } from '../hex';
import { spawnPoint } from '../terrain';
import { DT, addPlayer, addShot, addStructure, shootAt, world } from '../test/world';
import {
    GUN_DAMAGE,
    GUN_FIRE_INTERVAL_MS,
    GUN_SHOT_LIFETIME_MS,
    type PlayerHitEvent,
} from '../types/shared';
import { UpgradeSystem } from './UpgradeSystem';
import { CombatSystem } from './CombatSystem';
import { RespawnSystem } from './RespawnSystem';

const quiet = () => {};

describe('CombatSystem — hits and kills', () => {
    it('a blaster hit does 25, and four kill: +1 kill, the target is down, then respawns at its spawn', () => {
        const state = world();
        const shooter = addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 'b', 1500, 1500);
        target.spawnSlot = 3;
        shootAt(state, 'a', target);
        expect(GUN_DAMAGE.basic).toBe(25);
        expect(target.health).toBe(100 - GUN_DAMAGE.basic);
        for (let hit = 0; hit < 3; hit++) shootAt(state, 'a', target);
        expect(shooter.kills).toBe(1);
        expect(target.health).toBe(0);
        const wait = target.respawnAt - Date.now();
        expect(wait).toBeGreaterThan(RESPAWN_DELAY_MS - 100);
        expect(wait).toBeLessThanOrEqual(RESPAWN_DELAY_MS);
        expect([target.x, target.y]).toEqual([1500, 1500]); // still where it fell
        RespawnSystem.update(state, quiet, target.respawnAt);
        const start = spawnPoint(state, 3);
        expect(target.health).toBe(100);
        expect(target.respawnAt).toBe(0);
        expect([target.x, target.y]).toEqual([start.x, start.y]);
    });

    it("a player who is down can't be hit, and can't fire", () => {
        const state = world();
        const shooter = addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 't');
        target.gun = 'basic';
        target.ammo = 5;
        target.respawnAt = Date.now() + 1000;
        const shot = shootAt(state, 'a', target);
        expect(state.projectiles.has(shot.id)).toBe(true); // it flew on through
        expect(shooter.kills).toBe(0);
        expect(CombatSystem.fire(state, target, 0)).toBe(false);
    });

    it('broadcasts every hit with its damage', () => {
        const state = world();
        addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 'b');
        const events: PlayerHitEvent[] = [];
        addShot(state, 'a', target.x - 1, target.y, 0, GUN_DAMAGE.big);
        CombatSystem.update(state, DT, (type, payload) => {
            if (type === 'playerHit') events.push(payload as PlayerHitEvent);
        });
        expect(events).toEqual([{ targetId: 'b', damage: GUN_DAMAGE.big, shooterId: 'a' }]);
    });

    it('two Ion Cannon hits kill an unarmored player; an armored one is left with 100', () => {
        const state = world();
        const shooter = addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 't');
        shootAt(state, 'a', target, GUN_DAMAGE.big);
        expect(target.health).toBe(100 - GUN_DAMAGE.big);
        shootAt(state, 'a', target, GUN_DAMAGE.big);
        expect(shooter.kills).toBe(1);
        target.respawnAt = 0; // back in play
        target.armorLevel = 1;
        UpgradeSystem.applyUpgradeEffects(target);
        target.health = target.maxHealth;
        shootAt(state, 'a', target, GUN_DAMAGE.big);
        shootAt(state, 'a', target, GUN_DAMAGE.big);
        expect(target.health).toBe(100);
        expect(shooter.kills).toBe(1);
    });

    it('a defeated player drops their Armor with the rest, so comes back with 100 health (backpacks on)', () => {
        const state = world();
        state.dropBackpacks = true;
        addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 't');
        target.armorLevel = 3;
        UpgradeSystem.applyUpgradeEffects(target);
        target.health = 2 * GUN_DAMAGE.basic;
        shootAt(state, 'a', target);
        shootAt(state, 'a', target);
        expect(target.armorLevel).toBe(0);
        RespawnSystem.update(state, quiet, target.respawnAt);
        expect(target.health).toBe(100);
        expect(target.maxHealth).toBe(100);
    });

    it("doesn't hit the shooter, or anyone outside the playing phase", () => {
        const state = world();
        const shooter = addPlayer(state, 'a');
        shootAt(state, 'a', shooter);
        expect(shooter.health).toBe(100);
        const lobby = world('lobby');
        const target = addPlayer(lobby, 't');
        shootAt(lobby, 'x', target);
        expect(target.health).toBe(100);
    });
});

describe('CombatSystem — teams', () => {
    it('passes through teammates and their structures, but hits enemies', () => {
        const state = world();
        addPlayer(state, 'a', 100, 100, 'red');
        const mate = addPlayer(state, 'm', 1500, 1500, 'red');
        const enemy = addPlayer(state, 'e', 1500, 1700, 'blue');
        const shot = shootAt(state, 'a', mate);
        expect(mate.health).toBe(100);
        expect(state.projectiles.has(shot.id)).toBe(true); // still flying
        shootAt(state, 'a', enemy);
        expect(enemy.health).toBe(100 - GUN_DAMAGE.basic);

        const farm = addStructure(state, 'm', 40, 40);
        const c = hexCenter(40, 40);
        addShot(state, 'a', c.x, c.y);
        CombatSystem.update(state, DT, quiet);
        expect(farm.health).toBe(farm.maxHealth);
    });
});

describe('CombatSystem — structures', () => {
    it("damages an enemy's structure by the shot's damage, and removes it at 0", () => {
        const state = world();
        addPlayer(state, 'a', 100, 100);
        const farm = addStructure(state, 'o', 20, 20);
        const c = hexCenter(20, 20);
        const destroyed: string[] = [];
        const broadcast = (type: string, payload: unknown) => {
            if (type === 'structureDestroyed')
                destroyed.push((payload as { structureId: string }).structureId);
        };
        addShot(state, 'a', c.x, c.y);
        CombatSystem.update(state, DT, broadcast);
        expect(farm.health).toBe(farm.maxHealth - GUN_DAMAGE.basic);
        farm.health = GUN_DAMAGE.basic;
        addShot(state, 'a', c.x, c.y);
        CombatSystem.update(state, DT, broadcast);
        expect(state.structures.has(farm.id)).toBe(false);
        expect(destroyed).toEqual([farm.id]);
    });
});

describe('CombatSystem — respawn grace', () => {
    it("shots fly through a player who has just respawned, and hit them once it's over", () => {
        const state = world();
        addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 't');
        target.graceUntil = Date.now() + 5000;
        const shot = shootAt(state, 'a', target);
        expect(target.health).toBe(target.maxHealth);
        expect(state.projectiles.has(shot.id)).toBe(true); // it flew on
        target.graceUntil = Date.now() - 1;
        shootAt(state, 'a', target);
        expect(target.health).toBe(target.maxHealth - GUN_DAMAGE.basic);
    });
});

describe('CombatSystem — the two guns', () => {
    it('the Ion Cannon is double the Blaster: damage, fire rate and range', () => {
        expect(GUN_DAMAGE.big).toBe(2 * GUN_DAMAGE.basic);
        expect(GUN_FIRE_INTERVAL_MS.big).toBe(GUN_FIRE_INTERVAL_MS.basic / 2);
        expect(GUN_SHOT_LIFETIME_MS.big).toBe(2 * GUN_SHOT_LIFETIME_MS.basic);
    });

    it("a shot lives as long as its gun's: the Ion Cannon's twice the Blaster's", () => {
        const state = world();
        const shooter = addPlayer(state, 'a', 100, 100);
        shooter.ammo = 2;
        shooter.gun = 'basic';
        CombatSystem.fire(state, shooter, 0);
        shooter.gun = 'big';
        CombatSystem.fire(state, shooter, 0);
        const [blaster, cannon] = Array.from(state.projectiles.values());
        expect(blaster.lifetimeMs).toBe(GUN_SHOT_LIFETIME_MS.basic);
        expect(cannon.lifetimeMs).toBe(GUN_SHOT_LIFETIME_MS.big);
        expect([blaster.damage, cannon.damage]).toEqual([GUN_DAMAGE.basic, GUN_DAMAGE.big]);
        // After 3 s the Blaster's shot has gone and the Ion Cannon's is still flying.
        blaster.spawnedAt = cannon.spawnedAt = Date.now() - 3000;
        CombatSystem.update(state, DT, quiet);
        expect(state.projectiles.has(blaster.id)).toBe(false);
        expect(state.projectiles.has(cannon.id)).toBe(true);
    });
});

describe('CombatSystem — projectiles', () => {
    it.each([
        ['right', 0],
        ['down', 90],
        ['up', -90],
        ['down-right', 45],
        ['left', 180],
    ])('moves at the same on-screen speed in every direction: %s', (_label, degrees) => {
        const state = world('playing', { tiles: false });
        const shot = addShot(state, 'shooter', 1500, 1500, (degrees * Math.PI) / 180);
        for (let i = 0; i < 10; i++) CombatSystem.update(state, DT, quiet);
        const onScreen = Math.hypot(shot.x - 1500, (shot.y - 1500) * SQ);
        expect(onScreen).toBeCloseTo((shot.speed * 10) / TICK_RATE, 0);
    });

    it('expires after PROJECTILE_LIFETIME_MS and when it leaves the map', () => {
        const state = world('playing', { tiles: false });
        const old = addShot(state, 's', 1500, 1500);
        old.spawnedAt = Date.now() - PROJECTILE_LIFETIME_MS - 1;
        addShot(state, 's', 2, 1500, Math.PI); // about to leave the map on the left
        CombatSystem.update(state, DT, quiet);
        expect(state.projectiles.size).toBe(0);
    });

    // Shots move 20-33 world px per tick against a hit radius of PLAYER_RADIUS + PROJECTILE_RADIUS,
    // so an end-point-only test would let grazing shots skip a player. The swept test must not.
    it.each([
        ['sideways', 0],
        ['vertical', 90],
    ])(
        'always hits a player inside the hit radius, never tunneling through: %s',
        (_label, degrees) => {
            const reach = PLAYER_RADIUS + PROJECTILE_RADIUS;
            const a = (degrees * Math.PI) / 180;
            const dx = Math.cos(a);
            const dy = Math.sin(a);
            for (const offset of [0, reach * 0.5, reach * 0.8, reach * 0.95]) {
                let hits = 0;
                const trials = 300;
                for (let n = 0; n < trials; n++) {
                    const state = world('playing', { tiles: false });
                    const target = addPlayer(
                        state,
                        't',
                        1500 - dy * offset + dx * 300,
                        1500 + dx * offset + dy * 300
                    );
                    const shot = addShot(state, 'shooter', 1500, 1500, a);
                    // Start somewhere within one tick's travel, so every alignment gets tried.
                    const step = (shot.speed * DT) / Math.hypot(dx, dy * SQ);
                    const phase = Math.random();
                    shot.x -= dx * step * phase;
                    shot.y -= dy * step * phase;
                    for (let i = 0; i < 40 && state.projectiles.size > 0; i++) {
                        CombatSystem.update(state, DT, quiet);
                        if (target.health < 100) {
                            hits++;
                            break;
                        }
                    }
                }
                expect(hits, `offset ${offset.toFixed(0)}px`).toBe(trials);
            }
        }
    );
});

describe('CombatSystem.fire', () => {
    it("uses one ammo and sends a shot with the gun's damage from the shooter", () => {
        const state = world();
        const shooter = addPlayer(state, 'a', 300, 400);
        shooter.gun = 'big';
        shooter.ammo = 2;
        expect(CombatSystem.fire(state, shooter, 1.5)).toBe(true);
        expect(shooter.ammo).toBe(1);
        const [shot] = state.projectiles.values();
        expect(shot).toMatchObject({
            ownerId: 'a',
            x: 300,
            y: 400,
            angle: 1.5,
            damage: GUN_DAMAGE.big,
        });
        expect(CombatSystem.fire(state, shooter, 1.5)).toBe(true);
        expect(state.projectiles.size).toBe(2); // each shot has its own id
    });

    it('refuses without a gun or ammo, outside the match, or with a junk angle', () => {
        const state = world();
        const shooter = addPlayer(state, 'a');
        shooter.ammo = 5;
        expect(CombatSystem.fire(state, shooter, 0)).toBe(false); // no gun
        shooter.gun = 'basic';
        expect(CombatSystem.fire(state, shooter, Number.NaN)).toBe(false);
        state.phase.phase = 'results';
        expect(CombatSystem.fire(state, shooter, 0)).toBe(false);
        state.phase.phase = 'playing';
        shooter.ammo = 0;
        expect(CombatSystem.fire(state, shooter, 0)).toBe(false);
        expect(state.projectiles.size).toBe(0);
    });
});
