import type { GameState } from './state/GameState';

/**
 * True if the two players are on the same side: the same player, or teammates (same non-empty
 * `teamId`). Allies don't damage each other or each other's structures, can walk through each
 * other's structures, and don't take each other's tiles. A player who has left the room (their
 * id no longer in `state.players`) is nobody's ally.
 */
export function areAllies(state: GameState, playerIdA: string, playerIdB: string): boolean {
    if (playerIdA === playerIdB) return true;
    const a = state.players.get(playerIdA);
    const b = state.players.get(playerIdB);
    return !!a && !!b && a.teamId !== '' && a.teamId === b.teamId;
}
