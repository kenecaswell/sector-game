import { describe, expect, it } from 'vitest';
import { listingsFrom, randomGameCode, type GameMetadata } from './games';
import { GAME_CODE_ALPHABET, GAME_CODE_LENGTH, normalizeGameCode } from './types/shared';
import { seededRandom } from './terrain';

const meta = (name: string, phase: GameMetadata['phase'] = 'lobby', bots = 0): GameMetadata => ({
    name,
    mapSize: 'small',
    teams: false,
    pods: true,
    guns: false,
    matchMinutes: 5,
    phase,
    bots,
});

describe('game codes', () => {
    it('are GAME_CODE_LENGTH characters from the unambiguous alphabet, and valid codes', () => {
        const random = seededRandom(3);
        for (let i = 0; i < 500; i++) {
            const code = randomGameCode(random);
            expect(code).toHaveLength(GAME_CODE_LENGTH);
            expect([...code].every((c) => GAME_CODE_ALPHABET.includes(c))).toBe(true);
            expect(normalizeGameCode(code.toLowerCase())).toBe(code);
        }
    });
});

describe('listingsFrom', () => {
    it('lists open games with their settings and player counts, lobbies first then by name', () => {
        const games = listingsFrom([
            { roomId: 'PLAY', clients: 3, maxClients: 10, metadata: meta('Alpha', 'playing') },
            { roomId: 'ZZZZ', clients: 1, maxClients: 10, metadata: meta('Zed') },
            { roomId: 'BBBB', clients: 2, maxClients: 10, metadata: meta('Bravo') },
            { roomId: 'DONE', clients: 2, maxClients: 10, locked: true, metadata: meta('Over') },
            { roomId: 'HIDE', clients: 2, maxClients: 10, private: true, metadata: meta('Secret') },
            { roomId: 'NONE', clients: 0, maxClients: 10 }, // still being created
        ]);
        expect(games.map((g) => g.code)).toEqual(['BBBB', 'ZZZZ', 'PLAY']);
        expect(games[0]).toEqual({ code: 'BBBB', players: 2, maxPlayers: 10, ...meta('Bravo') });
    });

    it('counts bots as players: they take seats the room no longer offers to people', () => {
        // 1 person and 3 bots: GameRoom has lowered maxClients from 10 to 7.
        const [game] = listingsFrom([
            { roomId: 'SOLO', clients: 1, maxClients: 7, metadata: meta('Solo', 'lobby', 3) },
        ]);
        expect(game).toMatchObject({ players: 4, bots: 3, maxPlayers: 10 });
    });
});
