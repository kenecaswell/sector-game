import { useGameConnection } from '../context/GameContext';
import { NoticeStack } from '../components/NoticeStack';
import type { PlayerState } from '../types/gameState';
import {
    CHARACTERS,
    CHARACTER_IDS,
    DEFAULT_CHARACTER,
    GUN_NAMES,
    STRUCTURE_NAMES,
    TEAMS,
    TEAM_IDS,
    UPGRADE_NAMES,
    isCharacterId,
    isTeamId,
    type Character,
    type CharacterId,
    type TeamId,
} from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

// Real CSS for what inline styles can't express (:hover, :disabled, the narrow-screen layout).
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
    width: 100%;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    background: #2a2a44;
    color: #fff;
    font-size: 14px;
}
.lobby-select:disabled { opacity: 0.55; }
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
@media (max-width: 560px) {
    .lobby-row { grid-template-columns: 1fr 1fr; }
    .lobby-row--head { display: none; }
    .lobby-name, .lobby-ready, .lobby-status { grid-column: 1 / -1; }
}
`;

/**
 * The pre-match lobby. Every player is listed with their team (color), character and whether
 * they're ready; your own row has the controls. Once everyone is ready the server runs a short
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
    } = useGameConnection();
    const secondsLeft = usePhaseCountdown(phase === 'countdown' ? phaseEndsAt : 0, 100);

    const me = players.find((player) => player.id === sessionId);
    const connected = players.filter((player) => player.connected);
    const waitingFor = connected.filter((player) => !player.ready).length;

    let status = 'Pick a team and a character, then press Ready.';
    if (secondsLeft !== null) status = '';
    else if (me?.ready) {
        status = `Waiting for ${waitingFor} more ${waitingFor === 1 ? 'player' : 'players'} to get ready…`;
    }

    const teamCounts = new Map<string, number>();
    players.forEach((p) => teamCounts.set(p.teamId, (teamCounts.get(p.teamId) ?? 0) + 1));

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                overflowY: 'auto',
                background: '#1a1a2e',
                color: '#fff',
                fontFamily: 'sans-serif',
                display: 'flex',
                justifyContent: 'center',
                padding: '32px 16px',
                boxSizing: 'border-box',
            }}
        >
            <style>{LOBBY_CSS}</style>
            <NoticeStack notices={notices} />
            <div style={{ width: 680, maxWidth: '100%', textAlign: 'left' }}>
                <div style={{ fontSize: 13, letterSpacing: 2, opacity: 0.7, textAlign: 'center' }}>
                    SECTOR 42
                </div>
                <h1
                    style={{
                        margin: '4px 0 8px',
                        fontSize: 34,
                        color: '#fff',
                        textAlign: 'center',
                        letterSpacing: 'normal',
                    }}
                >
                    Lobby
                </h1>
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
                        <div>Team</div>
                        <div>Character</div>
                        <div />
                    </div>
                    {players.map((player) =>
                        player.id === sessionId ? (
                            <OwnRow
                                key={player.id}
                                player={player}
                                teamCounts={teamCounts}
                                onTeam={selectTeam}
                                onCharacter={selectCharacter}
                                onReady={setReady}
                            />
                        ) : (
                            <OtherRow key={player.id} player={player} />
                        )
                    )}
                </div>

                {me && <CharacterCard character={characterOf(me)} />}

                <p style={{ margin: '16px 0 0', fontSize: 13, opacity: 0.65, lineHeight: 1.5 }}>
                    Players with the same color are a team: you can't shoot each other or each
                    other's structures, you can walk through each other's structures, and you don't
                    take each other's tiles. Scores are still per player. The match starts 3 seconds
                    after everyone is ready.
                </p>
            </div>
        </div>
    );
}

function characterOf(player: PlayerState): Character {
    return CHARACTERS[isCharacterId(player.character) ? player.character : DEFAULT_CHARACTER];
}

function teamName(player: PlayerState): string {
    return isTeamId(player.teamId) ? TEAMS[player.teamId].name : '—';
}

function Name({ player, you }: { player: PlayerState; you?: boolean }) {
    return (
        <div className="lobby-name">
            <span className="lobby-swatch" style={{ background: player.color }} />
            <span>
                {player.name}
                {you ? ' (you)' : ''}
                {!player.connected ? ' (disconnected)' : ''}
            </span>
        </div>
    );
}

interface OwnRowProps {
    player: PlayerState;
    teamCounts: Map<string, number>;
    onTeam: (teamId: TeamId) => void;
    onCharacter: (characterId: CharacterId) => void;
    onReady: (ready: boolean) => void;
}

function OwnRow({ player, teamCounts, onTeam, onCharacter, onReady }: OwnRowProps) {
    const locked = player.ready;
    const lockedTitle = locked ? 'Un-ready to change this' : undefined;

    return (
        <div className="lobby-row lobby-row--you" role="listitem">
            <Name player={player} you />
            <div className="lobby-pick">
                <select
                    className="lobby-select"
                    aria-label="Team"
                    title={lockedTitle}
                    value={player.teamId}
                    disabled={locked}
                    onChange={(e) => {
                        if (isTeamId(e.target.value)) onTeam(e.target.value);
                    }}
                    style={{ borderLeft: `6px solid ${player.color}` }}
                >
                    {TEAM_IDS.map((id) => {
                        const count = teamCounts.get(id) ?? 0;
                        return (
                            <option key={id} value={id}>
                                {TEAMS[id].name}
                                {count > 0 ? ` (${count})` : ''}
                            </option>
                        );
                    })}
                </select>
            </div>
            <select
                className="lobby-select"
                aria-label="Character"
                title={lockedTitle}
                value={player.character}
                disabled={locked}
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

function OtherRow({ player }: { player: PlayerState }) {
    return (
        <div className="lobby-row" role="listitem" style={{ opacity: player.connected ? 1 : 0.5 }}>
            <Name player={player} />
            <div className="lobby-pick">
                <span className="lobby-swatch" style={{ background: player.color }} />
                {teamName(player)}
            </div>
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
        ['Credits', String(character.credits)],
        ['Structures', list(character.structures.map((type) => STRUCTURE_NAMES[type]))],
        ['Upgrades', list(character.upgrades.map((id) => UPGRADE_NAMES[id]))],
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
