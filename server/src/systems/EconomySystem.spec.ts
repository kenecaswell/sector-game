import { describe, expect, it } from 'vitest';
import { CREDIT_PAYOUT_INTERVAL_MS } from '../constants';
import { addPlayer, world } from '../test/world';
import { EconomySystem } from './EconomySystem';

describe('EconomySystem', () => {
    it('pays 1 credit per owned tile when the payout is due, then schedules the next one', () => {
        const state = world();
        const p = addPlayer(state, 'a');
        const broke = addPlayer(state, 'b');
        p.tilesOwned = 5;
        state.nextPayoutAt = Date.now() - 1;
        EconomySystem.update(state);
        expect(p.credits).toBe(5);
        expect(broke.credits).toBe(0);
        expect(state.nextPayoutAt - Date.now()).toBeGreaterThan(CREDIT_PAYOUT_INTERVAL_MS - 100);
        EconomySystem.update(state); // not due again yet
        expect(p.credits).toBe(5);
    });

    it('pays nothing outside the playing phase', () => {
        for (const phase of ['lobby', 'countdown', 'results'] as const) {
            const state = world(phase);
            const p = addPlayer(state, 'a');
            p.tilesOwned = 5;
            state.nextPayoutAt = Date.now() - 1;
            EconomySystem.update(state);
            expect(p.credits, phase).toBe(0);
        }
    });
});
