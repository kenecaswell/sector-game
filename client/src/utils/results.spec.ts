import { describe, expect, it } from 'vitest';
import { makePlayer, makeScore } from '../test/factories';
import { rankScores, scoresFromPlayers, teamTotals } from './results';

describe('rankScores', () => {
    it('ranks sorted standings 1, 2, 3', () => {
        const ranked = rankScores([
            makeScore({ playerId: 'a', score: 30 }),
            makeScore({ playerId: 'b', score: 20 }),
            makeScore({ playerId: 'c', score: 10 }),
        ]);
        expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    });

    it('gives tied scores the same rank and skips the next one', () => {
        const ranked = rankScores([
            makeScore({ playerId: 'a', score: 30 }),
            makeScore({ playerId: 'b', score: 30 }),
            makeScore({ playerId: 'c', score: 10 }),
        ]);
        expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    });
});

describe('scoresFromPlayers', () => {
    it('orders by score, then kills, then tiles', () => {
        const scores = scoresFromPlayers([
            makePlayer({ id: 'low', score: 5 }),
            makePlayer({ id: 'tiles', score: 10, kills: 1, tilesOwned: 9 }),
            makePlayer({ id: 'kills', score: 10, kills: 2, tilesOwned: 1 }),
        ]);
        expect(scores.map((s) => s.playerId)).toEqual(['kills', 'tiles', 'low']);
    });

    it("keeps valid team ids and blanks unknown ones (structure counts aren't known here)", () => {
        const [known, unknown] = scoresFromPlayers([
            makePlayer({ id: 'a', teamId: 'blue', score: 2 }),
            makePlayer({ id: 'b', teamId: 'pink', score: 1 }),
        ]);
        expect(known.teamId).toBe('blue');
        expect(unknown.teamId).toBe('');
        expect(known.structures).toBe(0);
    });
});

describe('teamTotals', () => {
    it('is empty when everyone was on their own team (a free-for-all)', () => {
        expect(
            teamTotals([
                makeScore({ playerId: 'a', teamId: 'red' }),
                makeScore({ playerId: 'b', teamId: 'blue' }),
            ])
        ).toEqual([]);
    });

    it('sums members per team, best team first, with the team name and color', () => {
        const totals = teamTotals([
            makeScore({ playerId: 'a', teamId: 'red', score: 10 }),
            makeScore({ playerId: 'b', teamId: 'blue', score: 25 }),
            makeScore({ playerId: 'c', teamId: 'red', score: 20 }),
        ]);
        expect(totals).toEqual([
            { teamId: 'red', name: 'Red', color: '#e74c3c', players: 2, score: 30 },
            { teamId: 'blue', name: 'Blue', color: '#3498db', players: 1, score: 25 },
        ]);
    });

    it('leaves out players without a team', () => {
        const totals = teamTotals([
            makeScore({ playerId: 'a', teamId: 'red', score: 1 }),
            makeScore({ playerId: 'b', teamId: 'red', score: 1 }),
            makeScore({ playerId: 'c', teamId: '', score: 99 }),
        ]);
        expect(totals).toHaveLength(1);
        expect(totals[0].score).toBe(2);
    });
});
