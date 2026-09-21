import type { GameState } from '../state/GameState';
import type { GamePhase, PhaseChangedEvent } from '../types/shared';
import { BUY_PHASE_DURATION_MS, MATCH_DURATION_MS, RESULTS_DURATION_MS } from '../constants';
import type { Broadcast } from './Broadcast';

const PHASE_DURATIONS_MS: Record<GamePhase, number> = {
  lobby: 0, // ends only when the host calls transitionTo('buying'), not on a timer
  buying: BUY_PHASE_DURATION_MS,
  playing: MATCH_DURATION_MS,
  results: RESULTS_DURATION_MS,
};

const NEXT_PHASE: Record<GamePhase, GamePhase | null> = {
  lobby: 'buying',
  buying: 'playing',
  playing: 'results',
  results: null, // room is disposed instead of transitioning further
};

/**
 * Advances the game phase when its timer expires. The lobby phase has no
 * timer — GameRoom calls transitionTo('buying', ...) explicitly when the
 * host starts the game. Flow: lobby -> buying (short shopping window, nothing
 * else allowed) -> playing (claiming, shooting and building all at once) ->
 * results (GameRoom closes the room when it ends).
 */
function update(state: GameState, broadcast: Broadcast): void {
  const phase = state.phase.phase as GamePhase;
  if (phase === 'lobby' || phase === 'results') return;
  if (Date.now() < state.phase.endsAt) return;

  const next = NEXT_PHASE[phase];
  if (next) transitionTo(state, next, broadcast);
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
