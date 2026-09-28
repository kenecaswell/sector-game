import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateGameScreen } from './CreateGameScreen';

function show(busy = false, error: string | null = null) {
    const props = { onCreate: vi.fn(), onBack: vi.fn() };
    render(<CreateGameScreen playerName="Ada" busy={busy} error={error} {...props} />);
    return props;
}

describe('CreateGameScreen', () => {
    it('starts from the defaults: Small map, teams off, drop pods on, 5 minutes', async () => {
        const { onCreate } = show();
        expect(screen.getByRole('textbox', { name: 'Game name' })).toHaveValue("Ada's game");
        expect(screen.getByRole('radio', { name: /Small/ })).toBeChecked();
        await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
        expect(onCreate).toHaveBeenCalledWith({
            name: "Ada's game",
            mapSize: 'small',
            teams: false,
            pods: true,
            matchMinutes: 5,
        });
    });

    it('sends the choices made', async () => {
        const { onCreate } = show();
        const name = screen.getByRole('textbox', { name: 'Game name' });
        await userEvent.clear(name);
        await userEvent.type(name, '  Friday night  ');
        await userEvent.click(screen.getByRole('radio', { name: /Large/ }));
        await userEvent.click(
            screen.getByRole('group', { name: 'Teams' }).querySelectorAll('input')[1]
        );
        await userEvent.click(
            screen.getByRole('group', { name: 'Drop pods' }).querySelectorAll('input')[1]
        );
        await userEvent.click(screen.getByRole('radio', { name: '10 min' }));
        await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
        expect(onCreate).toHaveBeenCalledWith({
            name: 'Friday night',
            mapSize: 'large',
            teams: true,
            pods: false,
            matchMinutes: 10,
        });
    });

    it('offers 5, 7 and 10 minute games', () => {
        show();
        for (const label of ['5 min', '7 min', '10 min']) {
            expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
        }
    });

    it('has the header, and Cancel before Create game at the bottom', async () => {
        const { onBack } = show();
        expect(screen.getByText('SECTOR 42')).toBeInTheDocument();
        const buttons = screen.getAllByRole('button').map((b) => b.textContent);
        expect(buttons.slice(-2)).toEqual(['Cancel', 'Create game']);
        await userEvent.click(screen.getByRole('button', { name: '← Games' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onBack).toHaveBeenCalledTimes(2);
    });

    it('waits while creating, and shows why creating failed', () => {
        show(true);
        expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    });

    it('shows an error', () => {
        show(false, 'The server is full');
        expect(screen.getByRole('alert')).toHaveTextContent('The server is full');
    });
});
