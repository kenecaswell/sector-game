import type { FinalScore, TeamId } from '../types/shared';
import { TEAMS, isTeamId } from '../types/shared';
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
            teamId: isTeamId(player.teamId) ? player.teamId : ('' as const),
            score: player.score,
            tilesOwned: player.tilesOwned,
            kills: player.kills,
            structures: 0,
        }))
        .sort((a, b) => b.score - a.score || b.kills - a.kills || b.tilesOwned - a.tilesOwned);
}

export interface TeamTotal {
    teamId: TeamId;
    name: string;
    color: string;
    players: number;
    score: number;
}

/**
 * Per-team score totals, best first — or an empty list when nobody shared a team (a free-for-all
 * needs no team table). Scores stay per player; this is just their sum.
 */
export function teamTotals(scores: FinalScore[]): TeamTotal[] {
    const totals = new Map<TeamId, TeamTotal>();
    scores.forEach((entry) => {
        if (!isTeamId(entry.teamId)) return;
        const team = totals.get(entry.teamId) ?? {
            teamId: entry.teamId,
            name: TEAMS[entry.teamId].name,
            color: TEAMS[entry.teamId].color,
            players: 0,
            score: 0,
        };
        team.players++;
        team.score += entry.score;
        totals.set(entry.teamId, team);
    });
    const list = Array.from(totals.values());
    if (!list.some((team) => team.players > 1)) return [];
    return list.sort((a, b) => b.score - a.score);
}
