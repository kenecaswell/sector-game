import { describe, expect, it } from 'vitest';
import type { GameListing } from '../types/shared';
import { filterGames, settingsSummary } from './games';

const game = (code: string, name: string, extra: Partial<GameListing> = {}): GameListing => ({
    code,
    name,
    mapSize: 'small',
    teams: false,
    pods: true,
    guns: false,
    matchMinutes: 5,
    phase: 'lobby',
    players: 1,
    bots: 0,
    maxPlayers: 10,
    ...extra,
});

describe('filterGames', () => {
    const games = [game('K7QF', "Ada's game"), game('ZZ22', 'Friday night')];

    it('matches the code or the name, ignoring case and spaces; empty shows all', () => {
        expect(filterGames(games, ' k7q ').map((g) => g.code)).toEqual(['K7QF']);
        expect(filterGames(games, 'FRIDAY').map((g) => g.code)).toEqual(['ZZ22']);
        expect(filterGames(games, '')).toHaveLength(2);
        expect(filterGames(games, 'nothing')).toEqual([]);
    });
});

describe('settingsSummary', () => {
    it('reads the settings out', () => {
        expect(
            settingsSummary(
                game('A', 'a', {
                    mapSize: 'large',
                    teams: true,
                    pods: false,
                    guns: true,
                    matchMinutes: 10,
                })
            )
        ).toBe('Large map · Teams · No pods · Guns · 10 min');
    });

    it('mentions bots when there are any', () => {
        expect(settingsSummary(game('A', 'a', { bots: 1 }))).toMatch(/· 1 bot$/);
        expect(settingsSummary(game('A', 'a', { bots: 3 }))).toMatch(/· 3 bots$/);
    });
});
