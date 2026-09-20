import { useGameConnection } from './context/GameContext';
import { GameScreen } from './screens/GameScreen';
import './App.css';

function App() {
  const { status, error, phase, players, sessionId, gameOver, connect, startGame } =
    useGameConnection();

  if (status !== 'connected') {
    return (
      <section id="center">
        <div>
          <h1>Sector 42</h1>
          <p>Status: {status}</p>
          {error && <p role="alert">{error}</p>}
        </div>

        {status === 'idle' && (
          <button type="button" className="counter" onClick={connect}>
            Join Game
          </button>
        )}

        {(status === 'connecting' || status === 'reconnecting') && <p>{status}…</p>}
      </section>
    );
  }

  if (gameOver) {
    return (
      <section id="center">
        <h2>Game Over</h2>
        <ol>
          {gameOver.scores
            .slice()
            .sort((a, b) => b.tilesOwned - a.tilesOwned)
            .map((score) => (
              <li key={score.playerId}>
                {score.playerId} — tiles: {score.tilesOwned}, kills: {score.kills}
              </li>
            ))}
        </ol>
      </section>
    );
  }

  if (phase !== 'lobby') {
    return <GameScreen />;
  }

  return (
    <section id="center">
      <div>
        <h1>Sector 42</h1>
        <p>Waiting in lobby…</p>
      </div>
      <ul>
        {players.map((player) => (
          <li key={player.id} style={{ color: player.color }}>
            {player.name}
            {player.id === sessionId ? ' (you)' : ''} — tiles: {player.tilesOwned}, kills:{' '}
            {player.kills}
            {!player.connected ? ' (disconnected)' : ''}
          </li>
        ))}
      </ul>
      <button type="button" className="counter" onClick={startGame}>
        Start Game
      </button>
    </section>
  );
}

export default App;
