import type { FinalScore } from '../types/shared';
import { rankScores, teamTotals } from '../utils/results';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

interface ResultsScreenProps {
    scores: FinalScore[];
    /** The local player's session id, to mark "(you)" and decide the headline. */
    sessionId: string | null;
    /** True while the room is still open (so its closing countdown is meaningful). */
    roomOpen: boolean;
    /** When the results period — and so the room — ends (server epoch ms). */
    phaseEndsAt: number;
    onPlayAgain: () => void;
    onExit: () => void;
}

const cell = { padding: '6px 10px' } as const;
const numberCell = { ...cell, textAlign: 'right' } as const;

/**
 * Full-screen final standings, shown when the match ends and kept on screen after the room
 * closes until the player chooses what to do next. Standings come from the server's `gameOver`
 * snapshot, so they don't change if someone leaves during the results period.
 */
export function ResultsScreen({
    scores,
    sessionId,
    roomOpen,
    phaseEndsAt,
    onPlayAgain,
    onExit,
}: ResultsScreenProps) {
    const ranked = rankScores(scores);
    const teams = teamTotals(scores);
    const secondsLeft = usePhaseCountdown(roomOpen ? phaseEndsAt : 0);

    const winners = ranked.filter((entry) => entry.rank === 1);
    const youWon = winners.some((entry) => entry.playerId === sessionId);
    let headline = 'Match over';
    if (winners.length === 1) {
        headline = youWon ? 'You win!' : `${winners[0].name} wins!`;
    } else if (winners.length > 1) {
        headline = `Tie: ${winners.map((entry) => entry.name).join(' & ')}`;
    }

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
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                boxSizing: 'border-box',
            }}
        >
            <div style={{ width: 560, maxWidth: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: 13, letterSpacing: 2, opacity: 0.7 }}>MATCH OVER</div>
                <h1 style={{ margin: '4px 0 20px', fontSize: 34, color: '#f1c40f' }}>{headline}</h1>

                {teams.length > 0 && (
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 15,
                            marginBottom: 20,
                        }}
                    >
                        <thead>
                            <tr style={{ opacity: 0.6, fontSize: 12, textAlign: 'left' }}>
                                <th style={cell}>Team</th>
                                <th style={numberCell}>Players</th>
                                <th style={numberCell}>Total score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teams.map((team) => (
                                <tr
                                    key={team.teamId}
                                    style={{
                                        textAlign: 'left',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                    }}
                                >
                                    <td style={cell}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                background: team.color,
                                                marginRight: 8,
                                            }}
                                        />
                                        {team.name}
                                    </td>
                                    <td style={numberCell}>{team.players}</td>
                                    <td style={{ ...numberCell, fontWeight: 'bold' }}>
                                        {team.score}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                    <thead>
                        <tr style={{ opacity: 0.6, fontSize: 12, textAlign: 'left' }}>
                            <th style={cell}>#</th>
                            <th style={cell}>Player</th>
                            <th style={numberCell}>Score</th>
                            <th style={numberCell}>Tiles</th>
                            <th style={numberCell}>Kills</th>
                            <th style={numberCell}>Structures</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranked.map((entry) => {
                            const isYou = entry.playerId === sessionId;
                            return (
                                <tr
                                    key={entry.playerId}
                                    style={{
                                        textAlign: 'left',
                                        background: isYou
                                            ? 'rgba(241, 196, 15, 0.14)'
                                            : 'transparent',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                    }}
                                >
                                    <td style={cell}>{entry.rank}</td>
                                    <td style={cell}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                background: entry.color,
                                                marginRight: 8,
                                            }}
                                        />
                                        {entry.name}
                                        {isYou ? ' (you)' : ''}
                                    </td>
                                    <td style={{ ...numberCell, fontWeight: 'bold' }}>
                                        {entry.score}
                                    </td>
                                    <td style={numberCell}>{entry.tilesOwned}</td>
                                    <td style={numberCell}>{entry.kills}</td>
                                    <td style={numberCell}>{entry.structures}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div style={{ margin: '14px 0 18px', fontSize: 13, opacity: 0.7 }}>
                    Score = 1 per tile + 50 per kill + 25 per structure.{' '}
                    {roomOpen && secondsLeft !== null
                        ? `This room closes in ${secondsLeft}s.`
                        : 'This room has closed.'}
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                        type="button"
                        onClick={onPlayAgain}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#f1c40f',
                            color: '#000',
                            fontWeight: 'bold',
                            fontSize: 15,
                        }}
                    >
                        Play again
                    </button>
                    <button
                        type="button"
                        onClick={onExit}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 8,
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            background: 'transparent',
                            color: '#fff',
                            fontSize: 15,
                        }}
                    >
                        Main menu
                    </button>
                </div>
            </div>
        </div>
    );
}
