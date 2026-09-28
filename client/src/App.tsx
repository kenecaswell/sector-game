import { useEffect, useRef } from 'react';
import { useGameConnection } from './context/GameContext';
import { CreateGameScreen } from './screens/CreateGameScreen';
import { GameScreen } from './screens/GameScreen';
import { GamesScreen } from './screens/GamesScreen';
import { JoiningScreen } from './screens/JoiningScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SplashScreen } from './screens/SplashScreen';
import { loadPlayerName } from './utils/playerName';
import { scoresFromPlayers } from './utils/results';
import { gamePath, navigate, useRoute } from './utils/route';
import './App.css';

/**
 * Picks the screen. Before you're in a game the URL decides (see utils/route.ts): the splash, the
 * game list, Create game, or /game/CODE, which joins that game. Once you're in, the game's phase
 * decides (lobby, match, results) and the URL is kept at /game/CODE so it can be shared.
 */
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
        gameCode,
        connect,
        playAgain,
        exitResults,
    } = useGameConnection();
    const route = useRoute();
    const connected = status === 'connected';
    const busy = status === 'connecting' || status === 'reconnecting';

    // In a game, the address bar shows its URL (after creating one, or when a reconnect landed us in
    // a different game than the URL asked for).
    useEffect(() => {
        if (connected && gameCode) navigate(gamePath(gameCode), { replace: true });
    }, [connected, gameCode]);

    // /game/CODE joins that game, once per visit to the URL (a failed join waits for "Try again").
    const triedCode = useRef<string | null>(null);
    const routeCode = route.page === 'game' ? route.code : null;
    useEffect(() => {
        if (!routeCode) {
            triedCode.current = null;
            return;
        }
        if (connected || busy || gameOver || triedCode.current === routeCode) return;
        triedCode.current = routeCode;
        connect({ join: routeCode });
    }, [routeCode, connected, busy, gameOver, connect]);

    // The results screen shows once the match ends — from the server's final snapshot (kept after
    // the room closes, until the player picks what to do next), or, if that never arrived, from
    // the live roster while still connected.
    if (gameOver || (connected && phase === 'results')) {
        return (
            <ResultsScreen
                scores={gameOver?.scores ?? scoresFromPlayers(players)}
                sessionId={sessionId ?? lastSessionId}
                roomOpen={connected}
                phaseEndsAt={phaseEndsAt}
                onPlayAgain={() => {
                    playAgain();
                    navigate('/play');
                }}
                onExit={() => {
                    exitResults();
                    navigate('/');
                }}
            />
        );
    }

    if (connected) {
        if (phase === 'lobby' || phase === 'countdown') return <LobbyScreen />;
        return <GameScreen />;
    }

    if (route.page === 'game') {
        return (
            <JoiningScreen
                code={route.code}
                error={busy ? null : error}
                onRetry={() => connect({ join: route.code })}
                onBack={() => navigate('/play')}
            />
        );
    }
    if (route.page === 'create') {
        return (
            <CreateGameScreen
                playerName={loadPlayerName() ?? ''}
                busy={busy}
                error={busy ? null : error}
                onCreate={(settings) => connect({ create: settings })}
                onBack={() => navigate('/play')}
            />
        );
    }
    if (route.page === 'games') {
        return (
            <GamesScreen
                onCreate={() => navigate('/play/new')}
                onJoin={(code) => navigate(gamePath(code))}
                onBack={() => navigate('/')}
            />
        );
    }
    return <SplashScreen onPlay={() => navigate('/play')} />;
}

export default App;
