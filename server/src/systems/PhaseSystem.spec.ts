import { describe, expect, it } from 'vitest';
import { MATCH_DURATION_MS, RESULTS_DURATION_MS } from '../constants';
import { GameState } from '../state/GameState';
import type { PhaseChangedEvent } from '../types/shared';
import { PhaseSystem } from './PhaseSystem';

function recorder() {
    const events: PhaseChangedEvent[] = [];
    return {
        events,
        broadcast: (_type: string, payload: unknown) => events.push(payload as PhaseChangedEvent),
    };
}

describe('PhaseSystem', () => {
    it('never advances the lobby or countdown on its own (LobbySystem owns those)', () => {
        const state = new GameState();
        const { events, broadcast } = recorder();
        PhaseSystem.update(state, broadcast);
        state.phase.phase = 'countdown';
        state.phase.endsAt = Date.now() - 1;
        PhaseSystem.update(state, broadcast);
        expect(state.phase.phase).toBe('countdown');
        expect(events).toHaveLength(0);
    });

    it('sets each phase timer and broadcasts the change', () => {
        const state = new GameState();
        const { events, broadcast } = recorder();
        PhaseSystem.transitionTo(state, 'playing', broadcast);
        expect(state.phase.endsAt - Date.now()).toBeGreaterThan(MATCH_DURATION_MS - 100);
        expect(events).toEqual([{ phase: 'playing', endsAt: state.phase.endsAt }]);
        PhaseSystem.transitionTo(state, 'lobby', broadcast);
        expect(state.phase.endsAt).toBe(0); // the lobby has no timer
    });

    it('ends the match when playing times out, and results is terminal', () => {
        const state = new GameState();
        const { events, broadcast } = recorder();
        PhaseSystem.transitionTo(state, 'playing');
        PhaseSystem.update(state, broadcast);
        expect(state.phase.phase).toBe('playing'); // not yet
        state.phase.endsAt = Date.now() - 1;
        PhaseSystem.update(state, broadcast);
        expect(state.phase.phase).toBe('results');
        expect(state.phase.endsAt - Date.now()).toBeGreaterThan(RESULTS_DURATION_MS - 100);
        state.phase.endsAt = Date.now() - 1;
        PhaseSystem.update(state, broadcast);
        expect(state.phase.phase).toBe('results'); // GameRoom closes the room instead
        expect(events.map((e) => e.phase)).toEqual(['results']);
    });
});
