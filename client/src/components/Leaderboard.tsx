import type { PlayerState } from '../types/gameState';

interface LeaderboardProps {
  players: PlayerState[];
  sessionId: string | null;
}

/**
 * Sorted by credits (the closest thing to a running score until
 * Player.score/win-condition scoring exists — see docs/technical-blueprint.md
 * "Planned Features" for the full scoring design). Re-renders whenever
 * GameContext's `players` array updates, which is already reactive.
 */
export function Leaderboard({ players, sessionId }: LeaderboardProps) {
  const ranked = [...players].sort((a, b) => b.credits - a.credits);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        minWidth: 180,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: 13,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Leaderboard</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {ranked.map((player) => (
          <li key={player.id} style={{ color: player.color }}>
            <span style={{ color: '#fff' }}>
              {player.name}
              {player.id === sessionId ? ' (you)' : ''} — {player.credits}cr / {player.tilesOwned}{' '}
              tiles / {player.kills} kills
              {!player.connected ? ' (disconnected)' : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
