import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeScore } from '../test/factories';
import type { FinalScore } from '../types/shared';
import { ResultsScreen } from './ResultsScreen';

function showResults(scores: FinalScore[], sessionId = 'a') {
    const onPlayAgain = vi.fn();
    const onExit = vi.fn();
    render(
        <ResultsScreen
            scores={scores}
            sessionId={sessionId}
            roomOpen={false}
            phaseEndsAt={0}
            onPlayAgain={onPlayAgain}
            onExit={onExit}
        />
    );
    return { onPlayAgain, onExit };
}

const alice = makeScore({ playerId: 'a', name: 'Alice', teamId: 'red', score: 30 });
const bob = makeScore({ playerId: 'b', name: 'Bob', teamId: 'blue', score: 20 });

describe('ResultsScreen', () => {
    it('congratulates you when you win', () => {
        showResults([alice, bob], 'a');
        expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument();
    });

    it("names the winner when it isn't you", () => {
        showResults([alice, bob], 'b');
        expect(screen.getByRole('heading', { name: 'Alice wins!' })).toBeInTheDocument();
    });

    it('calls a tie between everyone sharing first place', () => {
        showResults([alice, { ...bob, score: 30 }], 'b');
        expect(screen.getByRole('heading', { name: 'Tie: Alice & Bob' })).toBeInTheDocument();
    });

    it('adds a team table only when some team had two or more players', () => {
        showResults([alice, bob]);
        expect(screen.queryByRole('columnheader', { name: 'Team' })).not.toBeInTheDocument();
    });

    it('sums teammates in the team table', () => {
        showResults([alice, { ...bob, teamId: 'red' }]);
        expect(screen.getByRole('columnheader', { name: 'Team' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: '50' })).toBeInTheDocument();
    });

    it('says the room has closed, and offers play again / main menu', async () => {
        const { onPlayAgain, onExit } = showResults([alice, bob]);
        expect(screen.getByText(/This room has closed\./)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
        await userEvent.click(screen.getByRole('button', { name: 'Main menu' }));
        expect(onPlayAgain).toHaveBeenCalledOnce();
        expect(onExit).toHaveBeenCalledOnce();
    });
});
