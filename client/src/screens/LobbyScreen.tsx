import { useRef, useState } from 'react';
import { useGameConnection } from '../context/GameContext';
import { NoticeStack } from '../components/NoticeStack';
import type { GameSettingsState, PlayerState } from '../types/gameState';
import {
    BOT_DIFFICULTIES,
    BOT_DIFFICULTY_IDS,
    CHARACTERS,
    CHARACTER_IDS,
    DEFAULT_BOT_DIFFICULTY,
    DEFAULT_CHARACTER,
    GUN_NAMES,
    MAP_SIZES,
    MAX_PLAYERS,
    PLAYER_NAME_MAX_LENGTH,
    PLAYER_NAME_MIN_LENGTH,
    STRUCTURE_NAMES,
    TEAMS,
    TEAM_IDS,
    isBotDifficulty,
    isCharacterId,
    isTeamId,
    normalizePlayerName,
    type BotDifficulty,
    type Character,
    type CharacterId,
    type MapSizeId,
    type TeamId,
    type UpdateBotMessage,
    type UpgradeId,
    upgradeLabel,
} from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';
import { gamePath, navigate } from '../utils/route';
import { MENU_CSS } from './menuStyles';
import { MenuHeader } from './MenuHeader';
import { MenuFooter } from './MenuFooter';

// Real CSS for what inline styles can't express (:hover, :disabled, the narrow-screen layout).
// Selects use `appearance: none` with a drawn arrow: Safari otherwise ignores most of their styling
// and draws its own glossy control. (Custom team/character pickers are planned to replace them.)
// Class names are prefixed so they can't collide with anything else on the page.
const LOBBY_CSS = `
.lobby-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px 150px 112px;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 8px;
}
.lobby-row--you { background: rgba(241, 196, 15, 0.1); }
.lobby-row--head { padding-top: 0; padding-bottom: 4px; font-size: 12px; opacity: 0.6; }
.lobby-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.lobby-name span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lobby-swatch { flex-shrink: 0; width: 12px; height: 12px; border-radius: 50%; }
.lobby-pick { display: flex; align-items: center; gap: 8px; min-width: 0; }
.lobby-select {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    min-width: 0;
    padding: 6px 28px 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    background-color: #2a2a44;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    color: #fff;
    font: inherit;
    font-size: 14px;
    line-height: 1.3;
}
.lobby-select:disabled { opacity: 0.55; }
.lobby-select:focus-visible { outline: 2px solid #f1c40f; outline-offset: 1px; }
.lobby-name-field { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lobby-name-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font: inherit;
    font-size: 16px; /* 16px or more stops iOS Safari zooming in when the field is focused */
}
.lobby-name-input:hover { border-color: rgba(255, 255, 255, 0.45); }
.lobby-name-input:focus { outline: none; border-color: #f1c40f; background: rgba(0, 0, 0, 0.25); }
.lobby-name-input--invalid, .lobby-name-input--invalid:focus { border-color: #e74c3c; }
.lobby-name-hint { font-size: 12px; color: #ff8a7a; }
.lobby-you { flex-shrink: 0; font-size: 13px; opacity: 0.6; }
.lobby-ready {
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: #f1c40f;
    color: #000;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease;
}
.lobby-ready:hover { background: #ffd84a; }
.lobby-ready:active { transform: scale(0.95); }
.lobby-ready:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.lobby-ready--on { background: #2ecc71; color: #fff; }
.lobby-ready--on:hover { background: #27b463; }
.lobby-status { font-size: 13px; font-weight: bold; text-align: center; }
.lobby-copy {
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 13px;
    padding: 3px 8px;
    cursor: pointer;
}
.lobby-copy:hover { border-color: rgba(255, 255, 255, 0.6); }
.lobby-name-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lobby-bot-tag {
    flex-shrink: 0;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.15);
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 1px;
    overflow: visible;
}
.lobby-remove {
    flex-shrink: 0;
    margin-left: auto;
    padding: 2px 7px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}
.lobby-remove:hover:not(:disabled) { background: rgba(231, 76, 60, 0.35); color: #fff; }
.lobby-remove:disabled { opacity: 0.35; cursor: default; }
.lobby-remove:focus-visible { outline: 2px solid #f1c40f; }
.lobby-add-bot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 8px;
}
.lobby-add-bot .lobby-select { width: auto; min-width: 110px; }
.lobby-add-label { font-weight: bold; }
.lobby-add {
    padding: 7px 12px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
}
.lobby-add:hover:not(:disabled) { border-color: #f1c40f; color: #f1c40f; }
.lobby-add:disabled { opacity: 0.45; cursor: default; }
.lobby-add:focus-visible { outline: 2px solid #f1c40f; outline-offset: 1px; }
.lobby-add-hint { flex-basis: 100%; font-size: 13px; opacity: 0.65; }
/* Phones: your name on its own line, then the color/team and character pickers side by side, then
   Ready across the width; other players' rows wrap the same way. */
@media (max-width: 560px) {
    .lobby-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 8px; }
    .lobby-row--head { display: none; }
    .lobby-name, .lobby-ready, .lobby-status { grid-column: 1 / -1; }
    .lobby-ready { padding: 10px; }
    /* Other players: one line, name · character · ready (their dot shows their color/team). */
    .lobby-row--other { grid-template-columns: minmax(0, 1fr) auto auto; padding: 6px 12px; column-gap: 12px; }
    .lobby-row--other .lobby-team { display: none; }
    .lobby-row--other .lobby-name, .lobby-row--other .lobby-status { grid-column: auto; }
    .lobby-row--other .lobby-status { font-size: 12px; text-align: right; }
    .lobby-row--other > div:nth-child(3) { font-size: 14px; opacity: 0.85; }
    /* Bots: name (and remove) on one line, then color, character and difficulty side by side. */
    .lobby-row--bot { grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 6px; }
    .lobby-row--bot .lobby-select { padding-right: 22px; background-position: right 7px center; }
}
`;

/**
 * The pre-match lobby. Every player is listed with their name, team (color), character and whether
 * they're ready; your own row has the controls (your name is editable in place). Once everyone is ready the server runs a short
 * countdown and the match starts (see LobbySystem). Team and character are locked while you're
 * ready, so un-ready to change them.
 */
export function LobbyScreen() {
    const {
        phase,
        phaseEndsAt,
        players,
        sessionId,
        notices,
        selectTeam,
        selectCharacter,
        setReady,
        setName,
        addBot,
        removeBot,
        updateBot,
        settings,
        gameCode,
        leave,
    } = useGameConnection();
    const teams = settings?.teams ?? true;
    const [copied, setCopied] = useState(false);
    const copyLink = () => {
        if (!gameCode) return;
        const url = `${window.location.origin}${gamePath(gameCode)}`;
        navigator.clipboard
            ?.writeText(url)
            .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
    };
    const secondsLeft = usePhaseCountdown(phase === 'countdown' ? phaseEndsAt : 0, 100);

    const me = players.find((player) => player.id === sessionId);
    const connected = players.filter((player) => player.connected);
    const waitingFor = connected.filter((player) => !player.ready).length;

    let status = teams
        ? 'Set your name, pick a team and a character, then press Ready.'
        : 'Set your name, pick a color and a character, then press Ready.';
    if (secondsLeft !== null) status = '';
    else if (me?.ready) {
        status = `Waiting for ${waitingFor} more ${waitingFor === 1 ? 'player' : 'players'} to get ready…`;
    }

    const teamCounts = new Map<string, number>();
    players.forEach((p) => teamCounts.set(p.teamId, (teamCounts.get(p.teamId) ?? 0) + 1));

    return (
        <div className="menu-screen">
            <style>{MENU_CSS}</style>
            <style>{LOBBY_CSS}</style>
            <NoticeStack notices={notices} />
            <div className="menu-column" style={{ width: 680 }}>
                <MenuHeader
                    backLabel="Leave"
                    onBack={() => {
                        leave();
                        navigate('/play');
                    }}
                />
                <h1
                    style={{
                        margin: '0 0 8px',
                        fontSize: 34,
                        color: '#fff',
                        textAlign: 'center',
                        letterSpacing: 'normal',
                    }}
                >
                    Lobby
                </h1>
                {settings && gameCode && (
                    <div style={{ textAlign: 'center', fontSize: 14, marginBottom: 4 }}>
                        <strong>{settings.name}</strong> · code{' '}
                        <span
                            style={{
                                fontFamily: 'ui-monospace, Menlo, monospace',
                                letterSpacing: 2,
                            }}
                        >
                            {gameCode}
                        </span>{' '}
                        <button type="button" className="lobby-copy" onClick={copyLink}>
                            {copied ? 'Copied!' : 'Copy link'}
                        </button>
                        <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>
                            {settingsLine(settings)}
                        </div>
                    </div>
                )}
                <div
                    aria-live="polite"
                    style={{ minHeight: 44, marginBottom: 12, textAlign: 'center' }}
                >
                    {secondsLeft !== null ? (
                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f1c40f' }}>
                            Starting in {Math.max(1, secondsLeft)}…
                        </div>
                    ) : (
                        <div style={{ fontSize: 15, opacity: 0.8, paddingTop: 10 }}>{status}</div>
                    )}
                </div>

                <div role="list" aria-label="Players">
                    <div className="lobby-row lobby-row--head" aria-hidden="true">
                        <div>Player</div>
                        <div>{teams ? 'Team' : 'Color'}</div>
                        <div>Character</div>
                        <div />
                    </div>
                    {players.map((player) =>
                        player.id === sessionId ? (
                            <OwnRow
                                key={player.id}
                                player={player}
                                teams={teams}
                                teamCounts={teamCounts}
                                onTeam={selectTeam}
                                onCharacter={selectCharacter}
                                onReady={setReady}
                                onName={setName}
                            />
                        ) : player.bot ? (
                            <BotRow
                                key={player.id}
                                bot={player}
                                teams={teams}
                                teamCounts={teamCounts}
                                locked={phase !== 'lobby'}
                                onUpdate={updateBot}
                                onRemove={removeBot}
                            />
                        ) : (
                            <OtherRow key={player.id} player={player} teams={teams} />
                        )
                    )}
                </div>

                <AddBot
                    full={players.length >= MAX_PLAYERS}
                    locked={phase !== 'lobby'}
                    onAdd={addBot}
                />

                {me && <CharacterCard character={characterOf(me)} />}

                <p style={{ margin: '16px 0 0', fontSize: 13, opacity: 0.65, lineHeight: 1.5 }}>
                    {teams
                        ? "Players with the same color are a team: you can't shoot each other or each other's structures, you can walk through each other's structures, and you don't take each other's tiles. Scores are still per player."
                        : 'Teams are off in this game: everyone plays for themselves. Pick any color nobody else has.'}{' '}
                    The match starts 3 seconds after everyone is ready. Bots are always ready, so on
                    your own with bots it starts as soon as you are.
                </p>
            </div>
            <MenuFooter />
        </div>
    );
}

/** "Small map · Drop pods · 5 min" (teams are covered by the rows and the note below them). */
function settingsLine(settings: GameSettingsState): string {
    const size = MAP_SIZES[settings.mapSize as MapSizeId]?.name ?? settings.mapSize;
    return [
        `${size} map`,
        settings.teams ? 'Teams on' : 'Teams off',
        settings.pods ? 'Drop pods' : 'No drop pods',
        `${settings.matchMinutes} min`,
    ].join(' · ');
}

function characterOf(player: PlayerState): Character {
    return CHARACTERS[isCharacterId(player.character) ? player.character : DEFAULT_CHARACTER];
}

function teamName(player: PlayerState): string {
    return isTeamId(player.teamId) ? TEAMS[player.teamId].name : '—';
}

function Name({ player }: { player: PlayerState }) {
    return (
        <div className="lobby-name">
            <span className="lobby-swatch" style={{ background: player.color }} />
            <span>
                {player.name}
                {!player.connected ? ' (disconnected)' : ''}
            </span>
        </div>
    );
}

interface OwnRowProps {
    player: PlayerState;
    teams: boolean;
    teamCounts: Map<string, number>;
    onTeam: (teamId: TeamId) => void;
    onCharacter: (characterId: CharacterId) => void;
    onReady: (ready: boolean) => void;
    onName: (name: string) => void;
}

function OwnRow({ player, teams, teamCounts, onTeam, onCharacter, onReady, onName }: OwnRowProps) {
    const locked = player.ready;
    const lockedTitle = locked ? 'Un-ready to change this' : undefined;

    return (
        <div className="lobby-row lobby-row--you" role="listitem">
            <div className="lobby-name">
                <span className="lobby-swatch" style={{ background: player.color }} />
                <NameField name={player.name} onName={onName} />
                <span className="lobby-you">(you)</span>
            </div>
            <div className="lobby-pick">
                <TeamSelect
                    player={player}
                    teams={teams}
                    teamCounts={teamCounts}
                    label={teams ? 'Team' : 'Color'}
                    title={lockedTitle}
                    disabled={locked}
                    onTeam={onTeam}
                />
            </div>
            <CharacterSelect
                player={player}
                label="Character"
                title={lockedTitle}
                disabled={locked}
                onCharacter={onCharacter}
            />
            <button
                type="button"
                className={locked ? 'lobby-ready lobby-ready--on' : 'lobby-ready'}
                aria-pressed={locked}
                title={locked ? 'Click to cancel' : 'Mark yourself ready'}
                onClick={() => onReady(!locked)}
            >
                {locked ? '✓ Ready' : 'Ready'}
            </button>
        </div>
    );
}

interface TeamSelectProps {
    player: PlayerState;
    teams: boolean;
    teamCounts: Map<string, number>;
    label: string;
    title?: string;
    disabled: boolean;
    onTeam: (teamId: TeamId) => void;
}

/** A player's team (teams on) or color (teams off: colors someone else has are taken). */
function TeamSelect({
    player,
    teams,
    teamCounts,
    label,
    title,
    disabled,
    onTeam,
}: TeamSelectProps) {
    return (
        <select
            className="lobby-select"
            aria-label={label}
            title={title}
            value={player.teamId}
            disabled={disabled}
            onChange={(e) => {
                if (isTeamId(e.target.value)) onTeam(e.target.value);
            }}
            style={{ borderLeft: `6px solid ${player.color}` }}
        >
            {TEAM_IDS.map((id) => {
                const count = teamCounts.get(id) ?? 0;
                // Teams off: a color is yours alone, so one someone else has is taken.
                const taken = !teams && count > 0 && id !== player.teamId;
                return (
                    <option key={id} value={id} disabled={taken}>
                        {TEAMS[id].name}
                        {teams && count > 0 ? ` (${count})` : ''}
                        {taken ? ' (taken)' : ''}
                    </option>
                );
            })}
        </select>
    );
}

interface CharacterSelectProps {
    player: PlayerState;
    label: string;
    title?: string;
    disabled: boolean;
    onCharacter: (characterId: CharacterId) => void;
}

function CharacterSelect({ player, label, title, disabled, onCharacter }: CharacterSelectProps) {
    return (
        <select
            className="lobby-select"
            aria-label={label}
            title={title}
            value={player.character}
            disabled={disabled}
            onChange={(e) => {
                if (isCharacterId(e.target.value)) onCharacter(e.target.value);
            }}
        >
            {CHARACTER_IDS.map((id) => (
                <option key={id} value={id}>
                    {CHARACTERS[id].name}
                </option>
            ))}
        </select>
    );
}

interface BotRowProps {
    bot: PlayerState;
    teams: boolean;
    teamCounts: Map<string, number>;
    locked: boolean; // the countdown has started: bots can't be changed
    onUpdate: (update: UpdateBotMessage) => void;
    onRemove: (botId: string) => void;
}

/**
 * A bot: anyone in the lobby can change its color (or team), character and difficulty, or remove
 * it. Bots are always ready.
 */
function BotRow({ bot, teams, teamCounts, locked, onUpdate, onRemove }: BotRowProps) {
    const title = locked ? 'Bots can only be changed in the lobby' : undefined;
    return (
        <div className="lobby-row lobby-row--bot" role="listitem">
            <div className="lobby-name">
                <span className="lobby-swatch" style={{ background: bot.color }} />
                <span className="lobby-name-text">{bot.name}</span>
                <span className="lobby-bot-tag">BOT</span>
                <button
                    type="button"
                    className="lobby-remove"
                    aria-label={`Remove ${bot.name}`}
                    title={title ?? 'Remove this bot'}
                    disabled={locked}
                    onClick={() => onRemove(bot.id)}
                >
                    ✕
                </button>
            </div>
            <div className="lobby-pick">
                <TeamSelect
                    player={bot}
                    teams={teams}
                    teamCounts={teamCounts}
                    label={`${teams ? 'Team' : 'Color'} for ${bot.name}`}
                    title={title}
                    disabled={locked}
                    onTeam={(teamId) => onUpdate({ botId: bot.id, teamId })}
                />
            </div>
            <CharacterSelect
                player={bot}
                label={`Character for ${bot.name}`}
                title={title}
                disabled={locked}
                onCharacter={(characterId) => onUpdate({ botId: bot.id, characterId })}
            />
            <div className="lobby-bot-difficulty">
                <DifficultySelect
                    value={isBotDifficulty(bot.botDifficulty) ? bot.botDifficulty : undefined}
                    label={`Difficulty for ${bot.name}`}
                    title={title}
                    disabled={locked}
                    onChange={(difficulty) => onUpdate({ botId: bot.id, difficulty })}
                />
            </div>
        </div>
    );
}

interface DifficultySelectProps {
    value: BotDifficulty | undefined;
    label: string;
    title?: string;
    disabled: boolean;
    onChange: (difficulty: BotDifficulty) => void;
}

function DifficultySelect({ value, label, title, disabled, onChange }: DifficultySelectProps) {
    return (
        <select
            className="lobby-select"
            aria-label={label}
            title={title}
            value={value ?? DEFAULT_BOT_DIFFICULTY}
            disabled={disabled}
            onChange={(e) => {
                if (isBotDifficulty(e.target.value)) onChange(e.target.value);
            }}
        >
            {BOT_DIFFICULTY_IDS.map((id) => (
                <option key={id} value={id}>
                    {BOT_DIFFICULTIES[id].name}
                </option>
            ))}
        </select>
    );
}

/** Adds a computer-controlled player of the picked difficulty (lobby only, while there's room). */
function AddBot({
    full,
    locked,
    onAdd,
}: {
    full: boolean;
    locked: boolean;
    onAdd: (difficulty: BotDifficulty) => void;
}) {
    const [difficulty, setDifficulty] = useState<BotDifficulty>(DEFAULT_BOT_DIFFICULTY);
    let hint = `${BOT_DIFFICULTIES[difficulty].name}: ${BOT_DIFFICULTIES[difficulty].description}`;
    if (full) hint = `The game is full (${MAX_PLAYERS} players).`;
    return (
        <div className="lobby-add-bot">
            <span className="lobby-add-label">Bots</span>
            <DifficultySelect
                value={difficulty}
                label="New bot's difficulty"
                disabled={locked}
                onChange={setDifficulty}
            />
            <button
                type="button"
                className="lobby-add"
                disabled={full || locked}
                onClick={() => onAdd(difficulty)}
            >
                + Add bot
            </button>
            <span className="lobby-add-hint">{hint}</span>
        </div>
    );
}

/**
 * Your name, editable in place. Changes are sent when you leave the field or press Enter (Esc
 * cancels); an invalid name isn't sent and the field goes back to your current one. The server
 * may add " (1)" if someone else already has it, and the field then shows that.
 */
function NameField({ name, onName }: { name: string; onName: (name: string) => void }) {
    // null while not editing, so the field always shows the server's name otherwise.
    const [draft, setDraft] = useState<string | null>(null);
    const cancelled = useRef(false);
    const valid = draft === null || normalizePlayerName(draft) !== null;

    const commit = () => {
        const normalized = normalizePlayerName(draft);
        if (!cancelled.current && normalized !== null && normalized !== name) onName(normalized);
        cancelled.current = false;
        setDraft(null);
    };

    return (
        <div className="lobby-name-field">
            <input
                className={
                    valid ? 'lobby-name-input' : 'lobby-name-input lobby-name-input--invalid'
                }
                type="text"
                inputMode="text"
                enterKeyHint="done"
                autoComplete="nickname"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={PLAYER_NAME_MAX_LENGTH}
                aria-label="Your name"
                aria-invalid={!valid}
                value={draft ?? name}
                onFocus={(e) => {
                    setDraft(name);
                    e.currentTarget.select();
                }}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') {
                        cancelled.current = true;
                        e.currentTarget.blur();
                    }
                }}
            />
            {!valid && (
                <span className="lobby-name-hint" role="alert">
                    {PLAYER_NAME_MIN_LENGTH}–{PLAYER_NAME_MAX_LENGTH} characters
                </span>
            )}
        </div>
    );
}

/**
 * Another player: name (with their color dot), team (only when teams are on; with teams off the
 * dot says it all), character, ready state. On phones it's one compact line without the team.
 */
function OtherRow({ player, teams }: { player: PlayerState; teams: boolean }) {
    return (
        <div
            className="lobby-row lobby-row--other"
            role="listitem"
            style={{ opacity: player.connected ? 1 : 0.5 }}
        >
            <Name player={player} />
            {teams ? (
                <div className="lobby-pick lobby-team">
                    <span className="lobby-swatch" style={{ background: player.color }} />
                    {teamName(player)}
                </div>
            ) : (
                <div className="lobby-team" />
            )}
            <div>{characterOf(player).name}</div>
            <div
                className="lobby-status"
                style={{ color: player.ready ? '#2ecc71' : 'rgba(255, 255, 255, 0.5)' }}
            >
                {player.ready ? '✓ Ready' : 'Not ready'}
            </div>
        </div>
    );
}

/** What your chosen character starts the match with. */
function CharacterCard({ character }: { character: Character }) {
    const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'None');
    const stats: Array<[string, string]> = [
        ['Gun', character.gun ? GUN_NAMES[character.gun] : 'None'],
        ['Ammo', String(character.ammo)],
        ['Materials', String(character.materials)],
        ['Structures', list(character.structures.map((type) => STRUCTURE_NAMES[type]))],
        [
            'Upgrades',
            list(
                (Object.entries(character.upgrades) as Array<[UpgradeId, number]>).map(
                    ([id, level]) => upgradeLabel(id, level)
                )
            ),
        ],
    ];

    return (
        <div
            style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.06)',
            }}
        >
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.6 }}>YOUR CHARACTER</div>
            <div style={{ margin: '2px 0 8px' }}>
                <strong style={{ fontSize: 18 }}>{character.name}</strong>
                <span style={{ opacity: 0.75 }}> — {character.description}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 14 }}>
                {stats.map(([label, value]) => (
                    <div key={label}>
                        <span style={{ opacity: 0.6 }}>{label}:</span> {value}
                    </div>
                ))}
            </div>
        </div>
    );
}
