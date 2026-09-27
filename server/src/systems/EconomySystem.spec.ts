import { describe, expect, it } from 'vitest';
import { CREDITS_PER_CLAIM, DEV_CREDITS } from '../constants';
import { addPlayerAt, tileAt, world } from '../test/world';
import { CollisionSystem } from './CollisionSystem';
import { EconomySystem } from './EconomySystem';

describe('EconomySystem', () => {
    it('pays CREDITS_PER_CLAIM for each hex claimed, and nothing for standing on your own', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 10, 10);
        CollisionSystem.update(state, () => {});
        expect(p.tilesOwned).toBe(1);
        expect(p.credits).toBe(CREDITS_PER_CLAIM);
        CollisionSystem.update(state, () => {});
        expect(p.credits).toBe(CREDITS_PER_CLAIM);
    });

    it("pays only a hex's first claim: taking an enemy's pays nothing, and they keep theirs", () => {
        const state = world();
        const enemy = addPlayerAt(state, 'e', 10, 10);
        CollisionSystem.update(state, () => {});
        enemy.x = enemy.y = 100; // walk away
        const p = addPlayerAt(state, 'a', 10, 10);
        CollisionSystem.update(state, () => {});
        expect(p.tilesOwned).toBe(1);
        expect(p.credits).toBe(0);
        // The enemy claimed two hexes (the first, then where it now stands) and lost one.
        expect(enemy.tilesOwned).toBe(1);
        expect(enemy.credits).toBe(CREDITS_PER_CLAIM * 2);
    });

    it('a hex released when its owner left for good pays nothing to the next claimer', () => {
        const state = world();
        const tile = tileAt(state, 10, 10);
        tile.claimedBefore = true; // claimed earlier by someone who has since left
        tile.ownerId = '';
        const p = addPlayerAt(state, 'a', 10, 10);
        CollisionSystem.update(state, () => {});
        expect(tile.ownerId).toBe('a');
        expect(p.credits).toBe(0);
    });

    it('pays nothing outside the playing phase (nothing is claimed)', () => {
        for (const phase of ['lobby', 'countdown', 'results'] as const) {
            const state = world(phase);
            const p = addPlayerAt(state, 'a', 10, 10);
            CollisionSystem.update(state, () => {});
            expect(p.credits, phase).toBe(0);
        }
    });

    it('dev credits: +DEV_CREDITS while playing, never in other phases or when disabled', () => {
        const state = world();
        const p = addPlayerAt(state, 'a', 10, 10);
        EconomySystem.grantDevCredits(state, p, true);
        expect(p.credits).toBe(DEV_CREDITS);
        EconomySystem.grantDevCredits(state, p, false);
        expect(p.credits).toBe(DEV_CREDITS);
        state.phase.phase = 'results';
        EconomySystem.grantDevCredits(state, p, true);
        expect(p.credits).toBe(DEV_CREDITS);
    });
});
