import type { GameState } from './state/GameState';

/**
 * True if the two players are on the same side: the same player, or teammates (same non-empty
 * `teamId`, in a game with teams on; with teams off everyone else is an enemy, even if two
 * players end up with the same color because there are more players than colors). Allies don't damage each other or each other's structures, can walk through each
 * other's structures, and don't take each other's tiles. A player who has left the room (their
 * id no longer in `state.players`) is nobody's ally.
 */
export function areAllies(state: GameState, playerIdA: string, playerIdB: string): boolean {
    if (playerIdA === playerIdB) return true;
    if (!state.settings.teams) return false;
    const a = state.players.get(playerIdA);
    const b = state.players.get(playerIdB);
    return !!a && !!b && a.teamId !== '' && a.teamId === b.teamId;
}
