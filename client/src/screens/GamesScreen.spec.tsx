import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameListing } from '../types/shared';
import { GamesScreen } from './GamesScreen';

const listing = (code: string, name: string, extra: Partial<GameListing> = {}): GameListing => ({
    code,
    name,
    mapSize: 'small',
    teams: false,
    pods: true,
    guns: false,
    matchMinutes: 5,
    phase: 'lobby',
    players: 2,
    bots: 0,
    maxPlayers: 10,
    ...extra,
});

function show(fetchGames: () => Promise<GameListing[]>) {
    const props = { onCreate: vi.fn(), onJoin: vi.fn(), onBack: vi.fn() };
    render(<GamesScreen {...props} fetchGames={fetchGames} />);
    return props;
}

describe('GamesScreen', () => {
    it('puts Create game first, then lists the open games; picking one joins it', async () => {
        const props = show(async () => [
            listing('K7QF', "Ada's game"),
            listing('PLAY', 'Busy', { phase: 'playing', players: 10 }),
        ]);
        await userEvent.click(screen.getByRole('button', { name: /Create game/ }));
        expect(props.onCreate).toHaveBeenCalled();
        const ada = await screen.findByRole('button', { name: "Join Ada's game (K7QF)" });
        expect(ada).toHaveTextContent('Small map · No teams · Drop pods · No guns · 5 min');
        expect(ada).toHaveTextContent('In the lobby');
        await userEvent.click(ada);
        expect(props.onJoin).toHaveBeenCalledWith('K7QF');
        expect(screen.getByRole('button', { name: 'Join Busy (PLAY)' })).toBeDisabled(); // full
    });

    it('filters by code or name, and offers to join a full code that is not listed', async () => {
        const props = show(async () => [listing('K7QF', "Ada's game"), listing('ZZ22', 'Friday')]);
        await screen.findByRole('button', { name: /K7QF/ });
        const filter = screen.getByRole('searchbox');
        await userEvent.type(filter, 'friday');
        expect(screen.queryByRole('button', { name: /K7QF/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ZZ22/ })).toBeInTheDocument();
        await userEvent.clear(filter);
        await userEvent.type(filter, 'abcd');
        await userEvent.click(screen.getByRole('button', { name: /Join game ABCD/ }));
        expect(props.onJoin).toHaveBeenCalledWith('ABCD');
    });

    it("says so when there are no games, or the server can't be reached", async () => {
        show(async () => []);
        expect(await screen.findByText(/No open games yet/)).toBeInTheDocument();
    });

    it('reports an unreachable server', async () => {
        show(() => Promise.reject(new Error('offline')));
        await waitFor(() =>
            expect(screen.getByText(/Can't reach the game server/)).toBeInTheDocument()
        );
    });
});
