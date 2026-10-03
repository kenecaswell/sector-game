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

describe('ResultsScreen — score breakdown', () => {
    it("shows each player's tiles, structures with their points, and kills", () => {
        showResults([
            makeScore({
                playerId: 'a',
                name: 'Alice',
                score: 350,
                tilesOwned: 100,
                structures: 2,
                structurePoints: 250,
                kills: 3,
            }),
        ]);
        const row = screen.getByRole('row', { name: /Alice/ });
        const cells = Array.from(row.querySelectorAll('td')).map((c) => c.textContent);
        expect(cells.slice(2)).toEqual(['350', '100', '2 (+250)', '3']);
        expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
            '#',
            'Player',
            'Score',
            'Tiles',
            'Structures',
            'Kills',
        ]);
    });

    it('explains the new scoring: kills do not score', () => {
        showResults([alice]);
        expect(screen.getByText(/Score = 1 per tile \+ each structure/)).toBeInTheDocument();
        expect(screen.getByText(/Kills don.t\s+score/)).toBeInTheDocument();
        expect(screen.queryByText(/50 per kill/)).not.toBeInTheDocument();
    });
});

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
