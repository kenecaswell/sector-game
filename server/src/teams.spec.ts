import { describe, expect, it } from 'vitest';
import { addPlayer, world } from './test/world';
import { areAllies } from './teams';

describe('areAllies', () => {
    const state = world();
    addPlayer(state, 'red1', 0, 0, 'red');
    addPlayer(state, 'red2', 0, 0, 'red');
    addPlayer(state, 'blue', 0, 0, 'blue');
    addPlayer(state, 'solo1', 0, 0, '');
    addPlayer(state, 'solo2', 0, 0, '');

    it('you are your own ally', () => {
        expect(areAllies(state, 'red1', 'red1')).toBe(true);
        expect(areAllies(state, 'gone', 'gone')).toBe(true);
    });

    it('players on the same team are allies; different teams are not', () => {
        expect(areAllies(state, 'red1', 'red2')).toBe(true);
        expect(areAllies(state, 'red1', 'blue')).toBe(false);
    });

    it("two players with no team aren't allies", () => {
        expect(areAllies(state, 'solo1', 'solo2')).toBe(false);
    });

    it("a player who left the room is nobody's ally", () => {
        expect(areAllies(state, 'red1', 'gone')).toBe(false);
    });

    it('with teams off, even the same team color is an enemy', () => {
        const solo = world('playing', { tiles: false, teams: false });
        addPlayer(solo, 'a', 0, 0, 'red');
        addPlayer(solo, 'b', 0, 0, 'red');
        expect(areAllies(solo, 'a', 'b')).toBe(false);
        expect(areAllies(solo, 'a', 'a')).toBe(true);
    });
});
