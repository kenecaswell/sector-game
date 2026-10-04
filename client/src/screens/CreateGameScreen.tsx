import { useId, useState } from 'react';
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
 * Create game: the new game's name and settings (map size, teams, drop pods, guns, match length), with
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
                    legend="Game length"
                    name="matchMinutes"
                    value={settings.matchMinutes}
                    choices={MATCH_LENGTH_OPTIONS.map((minutes) => ({
                        value: minutes,
                        label: `${minutes} min`,
                    }))}
                    onChange={(value) => set('matchMinutes', value)}
                />
                <ToggleRow
                    label="Teams"
                    help="On: players can pick a team color and play as allies. Off: everyone for themselves."
                    checked={settings.teams}
                    onChange={(value) => set('teams', value)}
                />
                <ToggleRow
                    label="Drop pods"
                    help="Supply pods scattered on the map, with better odds for players behind."
                    checked={settings.pods}
                    onChange={(value) => set('pods', value)}
                />
                <ToggleRow
                    label="Guns"
                    help="On: players can fabricate guns and ammo, and find them in drop pods. Off: only Guard Towers shoot."
                    checked={settings.guns}
                    onChange={(value) => set('guns', value)}
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
    name,
    value,
    choices,
    onChange,
}: {
    legend: string;
    name: string;
    value: T;
    choices: Choice<T>[];
    onChange: (value: T) => void;
}) {
    return (
        <fieldset className="menu-fieldset">
            <legend className="menu-label">{legend}</legend>
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

/**
 * An on/off setting as an iPhone-style switch, with a [?] button that explains it. The switch is a
 * `role="switch"` button named by the label. The help appears while a mouse is over [?], or
 * pinned open by clicking or tapping it (so it works on touch and with the keyboard); clicking away,
 * leaving it with Tab or pressing Esc closes it.
 */
function ToggleRow({
    label,
    help,
    checked,
    onChange,
}: {
    label: string;
    help: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    const id = useId();
    const [hover, setHover] = useState(false);
    const [pinned, setPinned] = useState(false);
    const open = hover || pinned;

    return (
        <div className="menu-toggle-row">
            <span id={`${id}-label`} className="menu-label menu-toggle-label">
                {label}
            </span>
            <span className="menu-help">
                <button
                    type="button"
                    className="menu-help-button"
                    aria-label={`About ${label}`}
                    aria-expanded={open}
                    aria-describedby={open ? `${id}-help` : undefined}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
                    onPointerLeave={() => setHover(false)}
                    onClick={() => setPinned((value) => !value)}
                    onBlur={() => setPinned(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' && open) {
                            e.stopPropagation();
                            setHover(false);
                            setPinned(false);
                        }
                    }}
                >
                    ?
                </button>
                {open && (
                    <span id={`${id}-help`} role="tooltip" className="menu-tooltip">
                        {help}
                    </span>
                )}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={`${id}-label`}
                className="menu-switch"
                onClick={() => onChange(!checked)}
            >
                <span className="menu-switch-knob" />
            </button>
        </div>
    );
}
