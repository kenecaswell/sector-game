import type { GameState } from '../state/GameState';
import type { GamePhase, PhaseChangedEvent } from '../types/shared';
import { COUNTDOWN_DURATION_MS, PHASE_TIME_SCALE, RESULTS_DURATION_MS } from '../constants';
import type { Broadcast } from './Broadcast';

/** How long `playing` lasts in this game: its settings' match length (scaled for tests). */
function matchDurationMs(state: GameState): number {
    return state.settings.matchMinutes * 60_000 * PHASE_TIME_SCALE;
}

function phaseDurationMs(state: GameState, phase: GamePhase): number {
    if (phase === 'countdown') return COUNTDOWN_DURATION_MS;
    if (phase === 'playing') return matchDurationMs(state);
    if (phase === 'results') return RESULTS_DURATION_MS;
    return 0; // lobby: no timer, LobbySystem starts the countdown once everyone is ready
}

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
    state.phase.endsAt = phase === 'lobby' ? 0 : Date.now() + phaseDurationMs(state, phase);
    broadcast?.('phaseChanged', {
        phase,
        endsAt: state.phase.endsAt,
    } satisfies PhaseChangedEvent);
}

export const PhaseSystem = { update, transitionTo, matchDurationMs };
