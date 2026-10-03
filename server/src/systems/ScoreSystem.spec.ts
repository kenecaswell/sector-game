import { describe, expect, it } from 'vitest';
import { KILL_POINTS, TILE_POINTS } from '../constants';
import { FARMER_FARM_POINTS, STRUCTURE_SPECS } from '../types/shared';
import { addPlayer, addStructure, world } from '../test/world';
import { ScoreSystem } from './ScoreSystem';

describe('ScoreSystem', () => {
    it("scores tiles + kills + your own structures; materials and others' structures don't count", () => {
        const state = world();
        const p = addPlayer(state, 'a', 0, 0);
        p.tilesOwned = 10;
        p.kills = 2;
        p.materials = 9999;
        addStructure(state, 'a', 1, 1, 'fabricator');
        addStructure(state, 'a', 5, 5, 'guardTower');
        addStructure(state, 'other', 9, 9);
        ScoreSystem.update(state);
        const { fabricator, guardTower } = STRUCTURE_SPECS;
        expect(p.score).toBe(
            10 * TILE_POINTS + 2 * KILL_POINTS + fabricator.points + guardTower.points
        );
    });

    it('scores each type its own points: farm 100, fabricator 100, power plant 100, Guard Tower 50', () => {
        const state = world();
        const p = addPlayer(state, 'a', 0, 0);
        p.character = 'robot';
        addStructure(state, 'a', 1, 1, 'farm');
        ScoreSystem.update(state);
        expect(p.score).toBe(100);
        addStructure(state, 'a', 5, 5, 'fabricator');
        addStructure(state, 'a', 9, 9, 'power');
        addStructure(state, 'a', 13, 13, 'guardTower');
        ScoreSystem.update(state);
        expect(p.score).toBe(100 + 100 + 100 + 50);
    });

    it("a Farmer's farms score half as much again (150), other structures the same as anyone's", () => {
        const state = world();
        const farmer = addPlayer(state, 'farmer', 0, 0);
        farmer.character = 'farmer';
        const engineer = addPlayer(state, 'engineer', 0, 0);
        engineer.character = 'engineer';
        addStructure(state, 'farmer', 1, 1, 'farm');
        addStructure(state, 'farmer', 5, 5, 'fabricator');
        addStructure(state, 'engineer', 9, 9, 'farm');
        ScoreSystem.update(state);
        expect(FARMER_FARM_POINTS).toBe(150);
        expect(farmer.score).toBe(150 + 100);
        expect(engineer.score).toBe(100);
    });

    it('kills are counted but score nothing', () => {
        const state = world();
        const p = addPlayer(state, 'a', 0, 0);
        p.tilesOwned = 4;
        p.kills = 7;
        ScoreSystem.update(state);
        expect(KILL_POINTS).toBe(0);
        expect(p.score).toBe(4);
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

    it("final standings carry each player's structure points (a Farmer's farm is 150)", () => {
        const state = world();
        addPlayer(state, 'a').character = 'farmer';
        addPlayer(state, 'b').character = 'robot';
        addStructure(state, 'a', 3, 3, 'farm');
        addStructure(state, 'a', 7, 7, 'guardTower');
        addStructure(state, 'b', 11, 11, 'farm');
        const byId = Object.fromEntries(ScoreSystem.finalScores(state).map((e) => [e.playerId, e]));
        expect(byId.a).toMatchObject({ structures: 2, structurePoints: 200 });
        expect(byId.b).toMatchObject({ structures: 1, structurePoints: 100 });
    });
});
