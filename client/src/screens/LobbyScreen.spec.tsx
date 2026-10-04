import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { GameSettingsState, PlayerState } from '../types/gameState';
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
    addBot: vi.fn(),
    removeBot: vi.fn(),
    updateBot: vi.fn(),
    leave: vi.fn(),
    gameCode: 'K7QF' as string | null,
    settings: null as GameSettingsState | null,
};
vi.mock('../context/GameContext', () => ({ useGameConnection: () => connection }));

function showLobby(me: Partial<PlayerState> = {}, others: PlayerState[] = []) {
    connection.players = [makePlayer({ id: 'me', name: 'Ada', ...me }), ...others];
    return render(<LobbyScreen />);
}

beforeEach(() => {
    connection.phase = 'lobby';
    connection.phaseEndsAt = 0;
    connection.settings = null;
    for (const fn of [
        connection.selectTeam,
        connection.selectCharacter,
        connection.setReady,
        connection.setName,
        connection.addBot,
        connection.removeBot,
        connection.updateBot,
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
        await userEvent.click(screen.getByRole('button', { name: /^Team color:/ }));
        await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Character' }),
            'explorer'
        );
        expect(connection.selectTeam).toHaveBeenCalledWith('blue');
        expect(connection.selectCharacter).toHaveBeenCalledWith('explorer');
    });

    it("shows how many players are on each team and your character's kit", async () => {
        showLobby({ character: 'explorer' }, [makePlayer({ id: 'b', name: 'Bo', teamId: 'red' })]);
        await userEvent.click(screen.getByRole('button', { name: /^Team color:/ }));
        expect(screen.getByRole('radio', { name: 'Red (2)' })).toBeInTheDocument();
        expect(screen.getByText('Explorer', { selector: 'strong' })).toBeInTheDocument(); // the card's title
        expect(screen.getByText('Armor 1')).toBeInTheDocument(); // the Explorer's kit, since 2026-09-29
    });

    it("leaves Gun and Ammo off the character's kit unless the game has guns", () => {
        const game = (guns: boolean): GameSettingsState => ({
            name: 'G',
            mapSize: 'small',
            teams: false,
            pods: true,
            matchMinutes: 5,
            guns,
        });
        connection.settings = game(false);
        const { unmount } = showLobby({ character: 'explorer' });
        expect(screen.getByText('Materials:')).toBeInTheDocument();
        expect(screen.queryByText('Gun:')).not.toBeInTheDocument();
        expect(screen.queryByText('Ammo:')).not.toBeInTheDocument();
        unmount();
        connection.settings = game(true);
        showLobby({ character: 'explorer' });
        expect(screen.getByText('Gun:')).toBeInTheDocument();
        expect(screen.getByText('Ammo:')).toBeInTheDocument();
    });

    it('Ready toggles, and locks team and character while you are ready', async () => {
        const { unmount } = showLobby();
        await userEvent.click(screen.getByRole('button', { name: 'Ready' }));
        expect(connection.setReady).toHaveBeenCalledWith(true);
        unmount();

        showLobby({ ready: true });
        expect(screen.getByRole('button', { name: /^Team color:/ })).toBeDisabled();
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
        for (const name of ['Bo', 'Cy (disconnected)']) {
            const row = screen.getByText(name).closest('[role="listitem"]') as HTMLElement;
            expect(within(row).queryAllByRole('combobox')).toHaveLength(0);
            expect(within(row).queryAllByRole('button')).toHaveLength(0);
        }
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

describe('LobbyScreen — game settings', () => {
    const settings = (teams: boolean): GameSettingsState => ({
        name: "Ada's game",
        mapSize: 'big',
        teams,
        pods: true,
        matchMinutes: 10,
        guns: false,
    });

    it("shows the game's name, code and settings", () => {
        connection.settings = settings(true);
        showLobby();
        expect(screen.getByText("Ada's game")).toBeInTheDocument();
        expect(screen.getByText('K7QF')).toBeInTheDocument();
        expect(
            screen.getByText('Big map · Teams on · Drop pods · No guns · 10 min')
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Team color:/ })).toBeInTheDocument();
    });

    it("with teams off, it's a color picker: colors other players have are taken", async () => {
        connection.settings = settings(false);
        showLobby({ teamId: 'red' }, [makePlayer({ id: 'b', name: 'Bo', teamId: 'blue' })]);
        expect(screen.queryByRole('button', { name: /^Team color:/ })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /^Color:/ }));
        expect(screen.getByRole('radio', { name: 'Blue (taken)' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Red' })).toBeEnabled(); // yours
        await userEvent.click(screen.getByRole('radio', { name: 'Green' }));
        expect(connection.selectTeam).toHaveBeenCalledWith('green');
        expect(screen.getByText(/Teams are off in this game/)).toBeInTheDocument();
        // Bo's row has no team/color label (their dot shows it); the picker's swatch is only named Blue while it's open.
        expect(screen.queryByText('Blue')).not.toBeInTheDocument();
        expect(screen.getByText('© 2026 kenecaswell')).toBeInTheDocument();
    });

    it("with teams on, other players' rows name their team", () => {
        connection.settings = settings(true);
        showLobby({ teamId: 'red' }, [makePlayer({ id: 'b', name: 'Bo', teamId: 'blue' })]);
        expect(screen.getByText('Blue')).toBeInTheDocument();
    });

    it('Leave leaves the game and goes back to the game list', async () => {
        showLobby();
        expect(screen.getByText('SECTOR 42')).toBeInTheDocument(); // the shared header
        await userEvent.click(screen.getByRole('button', { name: '← Leave' }));
        expect(connection.leave).toHaveBeenCalled();
        expect(window.location.pathname).toBe('/play');
    });
});

describe('LobbyScreen — bots', () => {
    const teamsOff = () => {
        connection.settings = {
            name: 'Solo',
            mapSize: 'small',
            teams: false,
            pods: true,
            matchMinutes: 5,
            guns: false,
        };
    };
    const bot = (overrides: Partial<PlayerState> = {}) =>
        makePlayer({
            id: 'bot-0',
            name: 'Bot Cassini',
            bot: true,
            botDifficulty: 'easy',
            ready: true,
            teamId: 'green',
            color: '#2ecc71',
            character: 'engineer',
            ...overrides,
        });

    it('adds a bot of the picked difficulty (Medium unless you pick another)', async () => {
        showLobby();
        await userEvent.click(screen.getByRole('button', { name: '+ Add bot' }));
        expect(connection.addBot).toHaveBeenCalledWith('medium');
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: "New bot's difficulty" }),
            'Hard'
        );
        expect(screen.getByText(/Hard: /)).toBeInTheDocument(); // what Hard means
        await userEvent.click(screen.getByRole('button', { name: '+ Add bot' }));
        expect(connection.addBot).toHaveBeenLastCalledWith('hard');
    });

    it("shows a bot's picks, which anyone can change, and a button to remove it", async () => {
        teamsOff();
        showLobby({}, [bot()]);
        expect(screen.getByText('BOT')).toBeInTheDocument();
        const difficulty = screen.getByRole('combobox', { name: 'Difficulty for Bot Cassini' });
        expect(difficulty).toHaveValue('easy');
        await userEvent.selectOptions(difficulty, 'Hard');
        expect(connection.updateBot).toHaveBeenCalledWith({ botId: 'bot-0', difficulty: 'hard' });
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Character for Bot Cassini' }),
            'Robot'
        );
        expect(connection.updateBot).toHaveBeenCalledWith({ botId: 'bot-0', characterId: 'robot' });
        await userEvent.click(screen.getByRole('button', { name: /^Color for Bot Cassini:/ }));
        await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
        expect(connection.updateBot).toHaveBeenCalledWith({ botId: 'bot-0', teamId: 'teal' });
        await userEvent.click(screen.getByRole('button', { name: 'Remove Bot Cassini' }));
        expect(connection.removeBot).toHaveBeenCalledWith('bot-0');
    });

    it('with teams off, a bot cannot take your color', async () => {
        teamsOff();
        showLobby({ teamId: 'red' }, [bot()]);
        await userEvent.click(screen.getByRole('button', { name: /^Color for Bot Cassini:/ }));
        expect(screen.getByRole('radio', { name: 'Red (taken)' })).toBeDisabled();
    });

    it("bots don't count as players you're waiting for", () => {
        showLobby({ ready: true }, [bot(), makePlayer({ id: 'b' })]);
        expect(screen.getByText('Waiting for 1 more player to get ready…')).toBeInTheDocument();
    });

    it('locks bots once the countdown starts, and adding once the game is full', () => {
        connection.phase = 'countdown';
        connection.phaseEndsAt = Date.now() + 3000;
        showLobby({ ready: true }, [bot()]);
        expect(screen.getByRole('combobox', { name: 'Difficulty for Bot Cassini' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: /^(Team color|Color) for Bot Cassini:/ })
        ).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Remove Bot Cassini' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '+ Add bot' })).toBeDisabled();
    });

    it('no adding bots in a full game', () => {
        const others = Array.from({ length: 9 }, (_, i) =>
            bot({ id: `bot-${i}`, name: `Bot ${i}` })
        );
        showLobby({}, others);
        expect(screen.getByRole('button', { name: '+ Add bot' })).toBeDisabled();
        expect(screen.getByText('The game is full (10 players).')).toBeInTheDocument();
    });
});
