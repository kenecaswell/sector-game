import type { PlayerState } from '../types/gameState';
import { scoreFor } from '../utils/score';

interface LeaderboardProps {
    players: PlayerState[];
    sessionId: string | null;
    onClose: () => void;
}

/**
 * Leaderboard popup over the game canvas — GameScreen shows and hides it.
 * Clicking the dimmed backdrop, the close button, or pressing Esc closes it.
 * Ranked by `scoreFor` (a credits stand-in until real scoring exists) and
 * re-rendered whenever GameContext's reactive `players` array updates.
 */
export function Leaderboard({ players, sessionId, onClose }: LeaderboardProps) {
    const ranked = [...players].sort((a, b) => scoreFor(b) - scoreFor(a));

    return (
        <div
            role="presentation"
            onClick={onClose}
            style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                boxSizing: 'border-box',
            }}
        >
            <div
                role="dialog"
                aria-label="Leaderboard"
                onClick={(e) => e.stopPropagation()}
                style={{
                    minWidth: 280,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    overflowY: 'auto',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: 'rgba(20, 20, 35, 0.95)',
                    color: '#fff',
                    fontFamily: 'sans-serif',
                    fontSize: 14,
                    textAlign: 'left',
                    boxSizing: 'border-box',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                    }}
                >
                    <strong style={{ fontSize: 16 }}>Leaderboard</strong>
                    <button
                        type="button"
                        aria-label="Close leaderboard"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#fff',
                            fontSize: 20,
                            lineHeight: 1,
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                </div>
                <ol style={{ margin: 0, paddingLeft: 22 }}>
                    {ranked.map((player) => (
                        <li key={player.id} style={{ color: player.color, padding: '2px 0' }}>
                            <span style={{ color: '#fff' }}>
                                {player.name}
                                {player.id === sessionId ? ' (you)' : ''} — {scoreFor(player)} pts ·{' '}
                                {player.tilesOwned} tiles · {player.kills} kills
                                {!player.connected ? ' (disconnected)' : ''}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
