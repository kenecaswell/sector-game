import { describe, expect, it } from 'vitest';
import { KILL_POINTS, STRUCTURE_POINTS, TILE_POINTS } from '../constants';
import { addPlayer, addStructure, world } from '../test/world';
import { ScoreSystem } from './ScoreSystem';

describe('ScoreSystem', () => {
    it("scores tiles + kills + your own structures; materials and others' structures don't count", () => {
        const state = world();
        const p = addPlayer(state, 'a', 0, 0);
        p.tilesOwned = 10;
        p.kills = 2;
        p.materials = 9999;
        addStructure(state, 'a', 1, 1);
        addStructure(state, 'a', 5, 5);
        addStructure(state, 'other', 9, 9);
        ScoreSystem.update(state);
        expect(p.score).toBe(10 * TILE_POINTS + 2 * KILL_POINTS + 2 * STRUCTURE_POINTS);
    });

    it('is derived, not accumulated: losing a structure lowers it', () => {
        const state = world();
        const p = addPlayer(state, 'a', 0, 0);
        addStructure(state, 'a', 1, 1);
        ScoreSystem.update(state);
        state.structures.delete('s-1-1');
        ScoreSystem.update(state);
        expect(p.score).toBe(0);
    });

    it('orders final standings by score, then kills, then tiles, with team and structure counts', () => {
        const state = world();
        Object.assign(addPlayer(state, 'low'), { score: 5, name: 'Low', teamId: 'red' });
        Object.assign(addPlayer(state, 'tiles'), { score: 10, kills: 1, tilesOwned: 9 });
        Object.assign(addPlayer(state, 'kills'), { score: 10, kills: 2, tilesOwned: 1 });
        addStructure(state, 'low', 3, 3);
        const standings = ScoreSystem.finalScores(state);
        expect(standings.map((s) => s.playerId)).toEqual(['kills', 'tiles', 'low']);
        expect(standings[2]).toMatchObject({ name: 'Low', teamId: 'red', structures: 1 });
    });
});
