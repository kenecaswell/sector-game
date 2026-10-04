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
    it('starts from the defaults: Small map, teams off, drop pods on, guns off, 5 minutes', async () => {
        const { onCreate } = show();
        expect(screen.getByRole('textbox', { name: 'Game name' })).toHaveValue("Ada's game");
        expect(screen.getByRole('radio', { name: /Small/ })).toBeChecked();
        await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
        expect(onCreate).toHaveBeenCalledWith({
            name: "Ada's game",
            mapSize: 'small',
            teams: false,
            pods: true,
            guns: false,
            matchMinutes: 5,
        });
    });

    it('sends the choices made', async () => {
        const { onCreate } = show();
        const name = screen.getByRole('textbox', { name: 'Game name' });
        await userEvent.clear(name);
        await userEvent.type(name, '  Friday night  ');
        await userEvent.click(screen.getByRole('radio', { name: /Large/ }));
        await userEvent.click(screen.getByRole('switch', { name: 'Teams' }));
        await userEvent.click(screen.getByRole('switch', { name: 'Drop pods' }));
        await userEvent.click(screen.getByRole('switch', { name: 'Guns' }));
        await userEvent.click(screen.getByRole('radio', { name: '10 min' }));
        await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
        expect(onCreate).toHaveBeenCalledWith({
            name: 'Friday night',
            mapSize: 'large',
            teams: true,
            pods: false,
            guns: true,
            matchMinutes: 10,
        });
    });

    it('shows Map size, then Game length, then the Teams, Drop pods and Guns switches', () => {
        show();
        const text = document.body.textContent ?? '';
        const order = ['Map size', 'Game length', 'Teams', 'Drop pods', 'Guns'].map((label) =>
            text.indexOf(label)
        );
        expect(order.every((at) => at >= 0)).toBe(true);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('Teams, Drop pods and Guns are switches (pods on, the others off) that flip when clicked', async () => {
        show();
        const [teams, pods, guns] = ['Teams', 'Drop pods', 'Guns'].map((name) =>
            screen.getByRole('switch', { name })
        );
        expect(teams).toHaveAttribute('aria-checked', 'false');
        expect(pods).toHaveAttribute('aria-checked', 'true');
        expect(guns).toHaveAttribute('aria-checked', 'false');
        await userEvent.click(teams);
        await userEvent.click(pods);
        expect(teams).toHaveAttribute('aria-checked', 'true');
        expect(pods).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryByRole('radio', { name: 'On' })).not.toBeInTheDocument();
    });

    it('explains each switch in a [?] tooltip, not in the page text', async () => {
        show();
        expect(screen.queryByText(/pick a team color/)).not.toBeInTheDocument();
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        const help = screen.getByRole('button', { name: 'About Teams' });
        expect(help).toHaveTextContent('?');
        await userEvent.click(help);
        expect(screen.getByRole('tooltip')).toHaveTextContent(/pick a team color/);
        expect(help).toHaveAccessibleDescription(/pick a team color/);
        await userEvent.click(help); // unpins; the mouse is still over it, so it shows until it leaves
        await userEvent.unhover(help);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('shows the help while the mouse is over [?], and Esc or clicking away closes it', async () => {
        show();
        const help = screen.getByRole('button', { name: 'About Guns' });
        await userEvent.hover(help);
        expect(screen.getByRole('tooltip')).toHaveTextContent(
            /Only Guard Towers shoot|only Guard Towers shoot/
        );
        await userEvent.unhover(help);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        await userEvent.click(help);
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        await userEvent.click(help);
        await userEvent.unhover(help);
        expect(screen.getByRole('tooltip')).toBeInTheDocument(); // pinned: leaving doesn't close it
        await userEvent.click(screen.getByRole('textbox', { name: 'Game name' })); // blur closes it
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('opening help does not flip the switch or submit the form', async () => {
        const { onCreate } = show();
        await userEvent.click(screen.getByRole('button', { name: 'About Drop pods' }));
        expect(screen.getByRole('switch', { name: 'Drop pods' })).toHaveAttribute(
            'aria-checked',
            'true'
        );
        expect(onCreate).not.toHaveBeenCalled();
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
