import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { LobbyScreen } from './LobbyScreen';

// The lobby reads everything from the connection context; replace it with a controllable fake.
const connection = {
    phase: 'lobby' as 'lobby' | 'countdown',
    phaseEndsAt: 0,
    players: [] as PlayerState[],
    sessionId: 'me',
    notices: [],
    selectTeam: vi.fn(),
    selectCharacter: vi.fn(),
    setReady: vi.fn(),
    setName: vi.fn(),
};
vi.mock('../context/GameContext', () => ({ useGameConnection: () => connection }));

function showLobby(me: Partial<PlayerState> = {}, others: PlayerState[] = []) {
    connection.players = [makePlayer({ id: 'me', name: 'Ada', ...me }), ...others];
    return render(<LobbyScreen />);
}

beforeEach(() => {
    connection.phase = 'lobby';
    connection.phaseEndsAt = 0;
    for (const fn of [
        connection.selectTeam,
        connection.selectCharacter,
        connection.setReady,
        connection.setName,
    ]) {
        fn.mockReset();
    }
});

describe('LobbyScreen — your name', () => {
    it('shows your current name in an editable field', () => {
        showLobby();
        expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ada');
    });

    it('sends a new, cleaned-up name when you press Enter', async () => {
        showLobby();
        const field = screen.getByRole('textbox', { name: 'Your name' });
        await userEvent.clear(field);
        await userEvent.type(field, '  Grace   Hopper {Enter}');
        expect(connection.setName).toHaveBeenCalledWith('Grace Hopper');
    });

    it('sends it when you leave the field, too', async () => {
        showLobby();
        const field = screen.getByRole('textbox', { name: 'Your name' });
        await userEvent.clear(field);
        await userEvent.type(field, 'Grace');
        await userEvent.tab();
        expect(connection.setName).toHaveBeenCalledWith('Grace');
    });

    it('flags a too-short name and does not send it', async () => {
        showLobby();
        const field = screen.getByRole('textbox', { name: 'Your name' });
        await userEvent.clear(field);
        await userEvent.type(field, 'G');
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('2–25 characters');
        await userEvent.keyboard('{Enter}');
        expect(connection.setName).not.toHaveBeenCalled();
        expect(field).toHaveValue('Ada'); // back to your real name
    });

    it('Esc cancels the edit', async () => {
        showLobby();
        const field = screen.getByRole('textbox', { name: 'Your name' });
        await userEvent.clear(field);
        await userEvent.type(field, 'Grace{Escape}');
        expect(connection.setName).not.toHaveBeenCalled();
        expect(field).toHaveValue('Ada');
    });

    it("doesn't resend an unchanged name", async () => {
        showLobby();
        await userEvent.click(screen.getByRole('textbox', { name: 'Your name' }));
        await userEvent.keyboard('{Enter}');
        expect(connection.setName).not.toHaveBeenCalled();
    });
});

describe('LobbyScreen — team, character and ready', () => {
    it('picks a team and a character', async () => {
        showLobby();
        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'blue');
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Character' }),
            'smuggler'
        );
        expect(connection.selectTeam).toHaveBeenCalledWith('blue');
        expect(connection.selectCharacter).toHaveBeenCalledWith('smuggler');
    });

    it("shows how many players are on each team and your character's kit", () => {
        showLobby({ character: 'smuggler' }, [makePlayer({ id: 'b', name: 'Bo', teamId: 'red' })]);
        expect(screen.getByRole('option', { name: 'Red (2)' })).toBeInTheDocument();
        expect(screen.getByText('Smuggler', { selector: 'strong' })).toBeInTheDocument(); // the card's title
        expect(screen.getByText('Basic gun')).toBeInTheDocument();
    });

    it('Ready toggles, and locks team and character while you are ready', async () => {
        const { unmount } = showLobby();
        await userEvent.click(screen.getByRole('button', { name: 'Ready' }));
        expect(connection.setReady).toHaveBeenCalledWith(true);
        unmount();

        showLobby({ ready: true });
        expect(screen.getByRole('combobox', { name: 'Team' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Character' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Your name' })).toBeEnabled(); // names aren't locked
        await userEvent.click(screen.getByRole('button', { name: '✓ Ready' }));
        expect(connection.setReady).toHaveBeenCalledWith(false);
    });

    it("shows other players' picks read-only", () => {
        showLobby({}, [
            makePlayer({ id: 'b', name: 'Bo', teamId: 'blue', character: 'robot', ready: true }),
            makePlayer({ id: 'c', name: 'Cy', connected: false }),
        ]);
        expect(screen.getByText('Bo')).toBeInTheDocument();
        expect(screen.getByText('Robot', { selector: 'div' })).toBeInTheDocument(); // not the <option>
        expect(screen.getAllByText('✓ Ready')).toHaveLength(1);
        expect(screen.getByText('Cy (disconnected)')).toBeInTheDocument();
        // Only your row has controls.
        expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    it('says who it is waiting for once you are ready', () => {
        showLobby({ ready: true }, [makePlayer({ id: 'b' }), makePlayer({ id: 'c' })]);
        expect(screen.getByText('Waiting for 2 more players to get ready…')).toBeInTheDocument();
    });

    it('shows the countdown when everyone is ready', () => {
        connection.phase = 'countdown';
        connection.phaseEndsAt = Date.now() + 2500;
        showLobby({ ready: true });
        expect(screen.getByText('Starting in 3…')).toBeInTheDocument();
    });
});
