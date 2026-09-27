import { describe, expect, it } from 'vitest';
import { BASE_CLAIM_RADIUS, EXPANDER_CLAIM_RADII } from '../constants';
import { addPlayerAt, setTerrain, world } from '../test/world';
import { TERRAIN } from '../types/shared';
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
        expect(UpgradeSystem.equip(state, player, 'expander')).toBe(true);
        expect(player.equippedUpgrade).toBe('expander');
        expect(player.claimRadius).toBe(EXPANDER_CLAIM_RADII[2]);
    });

    it('switching away turns the old effect off', () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'expander');
        UpgradeSystem.equip(state, player, 'booster');
        expect(player.claimRadius).toBe(BASE_CLAIM_RADIUS);
        expect(UpgradeSystem.speedMultiplier(player)).toBe(1.5);
    });

    it('switches instantly, as often as you like (no cooldown)', () => {
        const { state, player } = owner();
        expect(UpgradeSystem.equip(state, player, 'booster')).toBe(true);
        expect(UpgradeSystem.equip(state, player, 'wings')).toBe(true);
        expect(UpgradeSystem.equip(state, player, 'expander')).toBe(true);
        expect(player.equippedUpgrade).toBe('expander');
    });

    it('can empty the slot', () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'booster');
        expect(UpgradeSystem.equip(state, player, '')).toBe(true);
        expect(player.equippedUpgrade).toBe('');
        expect(UpgradeSystem.speedMultiplier(player)).toBe(1);
    });

    it("refuses upgrades you don't own, Armor (no slot), junk, a no-op, and outside the match", () => {
        const { state, player } = owner();
        player.wingsLevel = 0;
        expect(UpgradeSystem.equip(state, player, 'wings')).toBe(false);
        expect(UpgradeSystem.equip(state, player, 'armor')).toBe(false);
        for (const junk of ['boost', 'toString', null, 42]) {
            expect(UpgradeSystem.equip(state, player, junk)).toBe(false);
        }
        expect(UpgradeSystem.equip(state, player, '')).toBe(false); // already empty
        state.phase.phase = 'lobby';
        expect(UpgradeSystem.equip(state, player, 'booster')).toBe(false);
        expect(player.equippedUpgrade).toBe('');
    });

    it("won't take Wings off over a mountain or deep water, only over ground", () => {
        const { state, player } = owner();
        UpgradeSystem.equip(state, player, 'wings');
        setTerrain(state, TERRAIN.mountain, [[20, 20]]);
        expect(UpgradeSystem.equip(state, player, 'booster')).toBe(false);
        expect(UpgradeSystem.canFly(player)).toBe(true);
        setTerrain(state, TERRAIN.ground, [[20, 20]]);
        expect(UpgradeSystem.equip(state, player, 'booster')).toBe(true);
    });

    it('Armor works whatever is equipped', () => {
        const { state, player } = owner();
        expect(player.maxHealth).toBe(200);
        UpgradeSystem.equip(state, player, 'wings');
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
