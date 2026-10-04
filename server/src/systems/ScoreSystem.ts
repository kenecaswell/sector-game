import type { GameState } from '../state/GameState';
import { KILL_POINTS, TILE_POINTS } from '../constants';
import { isStructureType, structurePoints, type FinalScore } from '../types/shared';

/**
 * Recomputes every player's score from current state:
 *   tiles owned x TILE_POINTS + kills x KILL_POINTS (0) + the points of each structure owned.
 *
 * Score is derived, not accumulated, so it goes down when tiles or structures
 * are lost — same as it goes up when they're gained. Materials are deliberately
 * not part of it (they're a spendable currency). Colyseus only syncs a field
 * when its value actually changes, so recomputing every tick costs nothing on
 * the wire.
 */
function update(state: GameState): void {
    const structurePointsByOwner = sumStructurePoints(state);

    state.players.forEach((player) => {
        player.score =
            player.tilesOwned * TILE_POINTS +
            player.kills * KILL_POINTS +
            (structurePointsByOwner.get(player.id) ?? 0);
    });
}

/** Each owner's structure points: every structure counts for its type's value (and a specialist's own type for more: SPECIALTIES). */
function sumStructurePoints(state: GameState): Map<string, number> {
    const totals = new Map<string, number>();
    state.structures.forEach((structure) => {
        if (!isStructureType(structure.type)) return;
        const character = state.players.get(structure.ownerId)?.character ?? '';
        const points = structurePoints(structure.type, character);
        totals.set(structure.ownerId, (totals.get(structure.ownerId) ?? 0) + points);
    });
    return totals;
}

function countStructuresByOwner(state: GameState): Map<string, number> {
    const counts = new Map<string, number>();
    state.structures.forEach((structure) => {
        counts.set(structure.ownerId, (counts.get(structure.ownerId) ?? 0) + 1);
    });
    return counts;
}

/**
 * Final standings for the results screen, best first: by score, then kills, then tiles (the
 * tie-break order is a placeholder — ties in score are still shown as shared ranks by the client).
 * Call `update` first so the numbers are current.
 */
function finalScores(state: GameState): FinalScore[] {
    const structuresByOwner = countStructuresByOwner(state);
    const pointsByOwner = sumStructurePoints(state);

    return Array.from(state.players.values())
        .map((player) => ({
            playerId: player.id,
            name: player.name,
            color: player.color,
            teamId: player.teamId as FinalScore['teamId'],
            score: player.score,
            tilesOwned: player.tilesOwned,
            kills: player.kills,
            structures: structuresByOwner.get(player.id) ?? 0,
            structurePoints: pointsByOwner.get(player.id) ?? 0,
        }))
        .sort((a, b) => b.score - a.score || b.kills - a.kills || b.tilesOwned - a.tilesOwned);
}

export const ScoreSystem = { update, finalScores };
