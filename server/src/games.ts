// Games as the lobby list sees them: short join codes, and the listing sent by GET /games.
// Each game is one GameRoom; its code is the room id, and its settings are in the room's metadata
// (kept up to date by GameRoom) so the list can be built from the matchmaker without asking rooms.

import { matchMaker } from 'colyseus';
import {
    GAME_CODE_ALPHABET,
    GAME_CODE_LENGTH,
    type GameListing,
    type GamePhase,
    type GameSettings,
} from './types/shared';

/** What a GameRoom keeps in its matchmaker metadata for the list. */
export type GameMetadata = GameSettings & { phase: GamePhase };

/** A random code of GAME_CODE_LENGTH characters from GAME_CODE_ALPHABET. */
export function randomGameCode(random: () => number = Math.random): string {
    let code = '';
    for (let i = 0; i < GAME_CODE_LENGTH; i++) {
        code += GAME_CODE_ALPHABET[Math.floor(random() * GAME_CODE_ALPHABET.length)];
    }
    return code;
}

/** A code no open room is using (checked against the matchmaker). */
export async function uniqueGameCode(random: () => number = Math.random): Promise<string> {
    for (;;) {
        const code = randomGameCode(random);
        const taken = await matchMaker.query({ roomId: code });
        if (taken.length === 0) return code;
    }
}

interface RoomSummary {
    roomId: string;
    clients: number;
    maxClients: number;
    locked?: boolean;
    private?: boolean;
    metadata?: Partial<GameMetadata>;
}

/**
 * The games to list, from the matchmaker's rooms: open ones (not locked or private: a finished
 * game locks itself for its results), newest-looking first isn't tracked, so waiting lobbies come
 * before games in play, then by name.
 */
export function listingsFrom(rooms: readonly RoomSummary[]): GameListing[] {
    return rooms
        .filter((room) => !room.locked && !room.private && room.metadata?.mapSize)
        .map((room) => {
            const meta = room.metadata as GameMetadata;
            return {
                code: room.roomId,
                name: meta.name,
                mapSize: meta.mapSize,
                teams: meta.teams,
                pods: meta.pods,
                matchMinutes: meta.matchMinutes,
                phase: meta.phase,
                players: room.clients,
                maxPlayers: room.maxClients,
            };
        })
        .sort(
            (a, b) =>
                Number(a.phase !== 'lobby') - Number(b.phase !== 'lobby') ||
                a.name.localeCompare(b.name)
        );
}

export async function listGames(): Promise<GameListing[]> {
    return listingsFrom(await matchMaker.query({ name: 'GameRoom' }));
}
