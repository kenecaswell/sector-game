import type { FinalScore } from '../types/shared';
import type { PlayerState } from '../types/gameState';

export interface RankedScore extends FinalScore {
    // 1-based; players with the same score share a rank (there's no tie-break yet).
    rank: number;
}

/** Adds shared ranks to standings that are already sorted best-first. */
export function rankScores(scores: FinalScore[]): RankedScore[] {
    return scores.map((entry, index) => {
        const firstWithSameScore = scores.findIndex((other) => other.score === entry.score);
        return { ...entry, rank: index === 0 ? 1 : firstWithSameScore + 1 };
    });
}

/**
 * Fallback if the server's final `gameOver` snapshot never arrived: build standings from the live
 * roster (same ordering as the server: score, then kills, then tiles). Structure counts aren't
 * available client-side here, so they show as 0.
 */
export function scoresFromPlayers(players: PlayerState[]): FinalScore[] {
    return players
        .map((player) => ({
            playerId: player.id,
            name: player.name,
            color: player.color,
            score: player.score,
            tilesOwned: player.tilesOwned,
            kills: player.kills,
            structures: 0,
        }))
        .sort((a, b) => b.score - a.score || b.kills - a.kills || b.tilesOwned - a.tilesOwned);
}
