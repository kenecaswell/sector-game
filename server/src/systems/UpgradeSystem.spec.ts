import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, EXPANDER_CLAIM_RADII } from '../constants';
import { addPlayerAt, setTerrain, world } from '../test/world';
import { TERRAIN, UPGRADE_SWITCH_COOLDOWN_MS } from '../types/shared';
import { UpgradeSystem } from './UpgradeSystem';

/** A player in a running match owning Booster 2, Expander 3 and Wings, with nothing equipped. */
function owner() {
    const state = world();
    const player = addPlayerAt(state, 'a', 20, 20);
    Object.assign(player, { boosterLevel: 2, expanderLevel: 3, wingsLevel: 1, armorLevel: 1 });
    UpgradeSystem.applyUpgradeEffects(player);
    return { state, player };
}

describe('UpgradeSystem.equip', () => {
    it('equips an owned slot upgrade, and its effect follows', () => {
        const { state, player } = owner();
        expect(UpgradeSystem.equip(state, player, 'expander', 1000)).toBe(true);
        expect(player.equippedUpgrade).toBe('expander');
        expect(player.claimRadius).toBe(EXPANDER_CLAIM_RADII[2]);
    });

    it('switching away turns the old effect off', () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'expander', 1000);
        UpgradeSystem.equip(state, player, 'booster', 1000 + UPGRADE_SWITCH_COOLDOWN_MS);
        expect(player.claimRadius).toBe(BASE_CLAIM_RADIUS);
        expect(UpgradeSystem.speedMultiplier(player)).toBe(1.5);
    });

    it(`allows one change per ${UPGRADE_SWITCH_COOLDOWN_MS / 1000} s`, () => {
        const { state, player } = owner();
        expect(UpgradeSystem.equip(state, player, 'booster', 1000)).toBe(true);
        expect(
            UpgradeSystem.equip(state, player, 'wings', 1000 + UPGRADE_SWITCH_COOLDOWN_MS - 1)
        ).toBe(false);
        expect(player.equippedUpgrade).toBe('booster');
        expect(UpgradeSystem.equip(state, player, 'wings', 1000 + UPGRADE_SWITCH_COOLDOWN_MS)).toBe(
            true
        );
        expect(player.upgradeSwitchReadyAt).toBe(1000 + 2 * UPGRADE_SWITCH_COOLDOWN_MS);
    });

    it('can empty the slot', () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'booster', 1000);
        expect(UpgradeSystem.equip(state, player, '', 1000 + UPGRADE_SWITCH_COOLDOWN_MS)).toBe(
            true
        );
        expect(player.equippedUpgrade).toBe('');
        expect(UpgradeSystem.speedMultiplier(player)).toBe(1);
    });

    it("refuses upgrades you don't own, Armor (no slot), junk, a no-op, and outside the match", () => {
        const { state, player } = owner();
        player.wingsLevel = 0;
        expect(UpgradeSystem.equip(state, player, 'wings', 1000)).toBe(false);
        expect(UpgradeSystem.equip(state, player, 'armor', 1000)).toBe(false);
        for (const junk of ['boost', 'toString', null, 42]) {
            expect(UpgradeSystem.equip(state, player, junk, 1000)).toBe(false);
        }
        expect(UpgradeSystem.equip(state, player, '', 1000)).toBe(false); // already empty
        state.phase.phase = 'lobby';
        expect(UpgradeSystem.equip(state, player, 'booster', 1000)).toBe(false);
        expect(player.equippedUpgrade).toBe('');
        expect(player.upgradeSwitchReadyAt).toBe(0); // refusals don't start the cooldown
    });

    it("won't take Wings off over a mountain or deep water, only over ground", () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'wings', 1000);
        setTerrain(state, TERRAIN.mountain, [[20, 20]]);
        const later = 1000 + UPGRADE_SWITCH_COOLDOWN_MS;
        expect(UpgradeSystem.equip(state, player, 'booster', later)).toBe(false);
        expect(UpgradeSystem.canFly(player)).toBe(true);
        setTerrain(state, TERRAIN.ground, [[20, 20]]);
        expect(UpgradeSystem.equip(state, player, 'booster', later)).toBe(true);
    });

    it('Armor works whatever is equipped', () => {
        const { state, player } = owner();
        expect(player.maxHealth).toBe(200);
        UpgradeSystem.equip(state, player, 'wings', 1000);
        expect(player.maxHealth).toBe(200);
    });
});

describe('UpgradeSystem.levelUp', () => {
    it('equips a slot upgrade bought into an empty slot, and never Armor', () => {
        const { player } = owner();
        UpgradeSystem.levelUp(player, 'armor');
        expect(player.equippedUpgrade).toBe('');
        UpgradeSystem.levelUp(player, 'booster');
        expect(player.equippedUpgrade).toBe('booster');
        UpgradeSystem.levelUp(player, 'expander'); // already at 3: stays 3, not equipped
        expect([player.expanderLevel, player.equippedUpgrade]).toEqual([3, 'booster']);
    });
});
