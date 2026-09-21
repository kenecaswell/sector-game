import type { GameState } from '../state/GameState';
import { CREDIT_PAYOUT_INTERVAL_MS } from '../constants';

/**
 * Pays out 1 credit per tile a player owns, every CREDIT_PAYOUT_INTERVAL_MS.
 * Runs only during `playing` — payouts stop once `results` begins so the
 * economy can't change after the match is decided, and `lobby` has no owned
 * tiles yet regardless.
 *
 * Uses a wall-clock `nextPayoutAt` timestamp (like PhaseSystem's `endsAt`)
 * rather than counting ticks, so payouts stay correct even if TICK_RATE changes.
 */
function update(state: GameState): void {
    const phase = state.phase.phase;
    if (phase !== 'playing') return;
    if (Date.now() < state.nextPayoutAt) return;

    state.players.forEach((player) => {
        if (player.tilesOwned > 0) player.credits += player.tilesOwned;
    });

    state.nextPayoutAt = Date.now() + CREDIT_PAYOUT_INTERVAL_MS;
}

export const EconomySystem = { update };
