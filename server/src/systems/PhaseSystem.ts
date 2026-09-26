import type { GameState } from '../state/GameState';
import type { GamePhase, PhaseChangedEvent } from '../types/shared';
import { COUNTDOWN_DURATION_MS, MATCH_DURATION_MS, RESULTS_DURATION_MS } from '../constants';
import type { Broadcast } from './Broadcast';

const PHASE_DURATIONS_MS: Record<GamePhase, number> = {
    lobby: 0, // no timer: LobbySystem starts the countdown once everyone is ready
    countdown: COUNTDOWN_DURATION_MS,
    playing: MATCH_DURATION_MS,
    results: RESULTS_DURATION_MS,
};

/**
 * Advances the game phase when its timer expires. Flow: lobby -> countdown -> playing (claiming,
 * shooting, building and shopping all at once) -> results (GameRoom closes the room when it ends).
 * The lobby and countdown belong to LobbySystem, which can also cancel the countdown and applies
 * everyone's starting kit when it finishes, so this only times `playing`.
 */
function update(state: GameState, broadcast: Broadcast): void {
    if (state.phase.phase !== 'playing') return;
    if (Date.now() < state.phase.endsAt) return;
    transitionTo(state, 'results', broadcast);
}

function transitionTo(state: GameState, phase: GamePhase, broadcast?: Broadcast): void {
    state.phase.phase = phase;
    state.phase.endsAt = phase === 'lobby' ? 0 : Date.now() + PHASE_DURATIONS_MS[phase];
    broadcast?.('phaseChanged', {
        phase,
        endsAt: state.phase.endsAt,
    } satisfies PhaseChangedEvent);
}

export const PhaseSystem = { update, transitionTo };
