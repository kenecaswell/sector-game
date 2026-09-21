import { useGameConnection } from './context/GameContext';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { scoresFromPlayers } from './utils/results';
import './App.css';

function App() {
    const {
        status,
        error,
        phase,
        phaseEndsAt,
        players,
        sessionId,
        lastSessionId,
        gameOver,
        connect,
        startGame,
        playAgain,
        exitResults,
    } = useGameConnection();

    // The results screen shows once the match ends — from the server's final snapshot (kept after
    // the room closes, until the player picks what to do next), or, if that never arrived, from
    // the live roster while still connected.
    if (gameOver || (status === 'connected' && phase === 'results')) {
        return (
            <ResultsScreen
                scores={gameOver?.scores ?? scoresFromPlayers(players)}
                sessionId={sessionId ?? lastSessionId}
                roomOpen={status === 'connected'}
                phaseEndsAt={phaseEndsAt}
                onPlayAgain={playAgain}
                onExit={exitResults}
            />
        );
    }

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
                        {player.id === sessionId ? ' (you)' : ''} — tiles: {player.tilesOwned},
                        kills: {player.kills}
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
