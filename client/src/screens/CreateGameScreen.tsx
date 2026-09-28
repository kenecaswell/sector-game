import { useState } from 'react';
import {
    DEFAULT_GAME_SETTINGS,
    GAME_NAME_MAX_LENGTH,
    MAP_SIZES,
    MAP_SIZE_IDS,
    MATCH_LENGTH_OPTIONS,
    type GameSettings,
} from '../types/shared';
import { MENU_CSS } from './menuStyles';
import { MenuHeader } from './MenuHeader';
import { MenuFooter } from './MenuFooter';

interface CreateGameScreenProps {
    /** The player's saved name, for the suggested game name ("Ada's game"). */
    playerName: string;
    /** True while the game is being created (the button waits). */
    busy: boolean;
    error: string | null;
    onCreate: (settings: GameSettings) => void;
    onBack: () => void;
}

interface Choice<T> {
    value: T;
    label: string;
}

/**
 * Create game: the new game's name and settings (map size, teams, drop pods, match length), with
 * the defaults from DEFAULT_GAME_SETTINGS. Creating it takes you to its lobby.
 */
export function CreateGameScreen({
    playerName,
    busy,
    error,
    onCreate,
    onBack,
}: CreateGameScreenProps) {
    const suggestedName = playerName ? `${playerName}'s game` : '';
    const [settings, setSettings] = useState<GameSettings>({
        ...DEFAULT_GAME_SETTINGS,
        name: suggestedName,
    });
    const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
        setSettings((current) => ({ ...current, [key]: value }));

    return (
        <main className="menu-screen">
            <style>{MENU_CSS}</style>
            <form
                className="menu-column"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) onCreate({ ...settings, name: settings.name.trim() });
                }}
            >
                <MenuHeader backLabel="Games" onBack={onBack} />
                <h1 className="menu-title">Create game</h1>

                <label className="menu-field" style={{ display: 'block' }}>
                    <span className="menu-label">Game name</span>
                    <input
                        className="menu-input"
                        value={settings.name}
                        maxLength={GAME_NAME_MAX_LENGTH}
                        onChange={(e) => set('name', e.target.value)}
                        placeholder="Shown in the game list"
                    />
                </label>

                <Choices
                    legend="Map size"
                    name="mapSize"
                    value={settings.mapSize}
                    choices={MAP_SIZE_IDS.map((id) => ({
                        value: id,
                        label: `${MAP_SIZES[id].name} (${MAP_SIZES[id].cols} × ${MAP_SIZES[id].rows})`,
                    }))}
                    onChange={(value) => set('mapSize', value)}
                />
                <Choices
                    legend="Teams"
                    hint="On: players can pick a team color and play as allies. Off: everyone for themselves."
                    name="teams"
                    value={settings.teams}
                    choices={[
                        { value: false, label: 'Off' },
                        { value: true, label: 'On' },
                    ]}
                    onChange={(value) => set('teams', value)}
                />
                <Choices
                    legend="Drop pods"
                    hint="Supply pods scattered on the map, with better odds for players behind."
                    name="pods"
                    value={settings.pods}
                    choices={[
                        { value: true, label: 'On' },
                        { value: false, label: 'Off' },
                    ]}
                    onChange={(value) => set('pods', value)}
                />
                <Choices
                    legend="Game length"
                    name="matchMinutes"
                    value={settings.matchMinutes}
                    choices={MATCH_LENGTH_OPTIONS.map((minutes) => ({
                        value: minutes,
                        label: `${minutes} min`,
                    }))}
                    onChange={(value) => set('matchMinutes', value)}
                />

                {error && (
                    <div role="alert" className="menu-alert">
                        {error}
                    </div>
                )}

                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 28,
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <button type="button" className="menu-text-button" onClick={onBack}>
                        Cancel
                    </button>
                    <button type="submit" className="menu-green" disabled={busy}>
                        {busy ? 'Creating…' : 'Create game'}
                    </button>
                </div>
            </form>
            <MenuFooter />
        </main>
    );
}

function Choices<T extends string | number | boolean>({
    legend,
    hint,
    name,
    value,
    choices,
    onChange,
}: {
    legend: string;
    hint?: string;
    name: string;
    value: T;
    choices: Choice<T>[];
    onChange: (value: T) => void;
}) {
    return (
        <fieldset className="menu-fieldset">
            <legend className="menu-label">{legend}</legend>
            {hint && (
                <div className="menu-muted" style={{ margin: '-4px 0 8px' }}>
                    {hint}
                </div>
            )}
            <div className="menu-choices">
                {choices.map((choice) => (
                    <label key={String(choice.value)} className="menu-choice">
                        <input
                            type="radio"
                            name={name}
                            checked={choice.value === value}
                            onChange={() => onChange(choice.value)}
                        />
                        <span>{choice.label}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
